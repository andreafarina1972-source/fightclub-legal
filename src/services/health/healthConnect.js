// src/services/health/healthConnect.js
//
// Implementazione Android del provider salute, basata su
// react-native-health-connect (installata, v4 — assorbe anche quello che
// prima era expo-health-connect, ora deprecato). Il require è lazy: se il
// pacchetto non fosse presente, getSdk() ritorna false e ogni funzione qui
// sotto si comporta esattamente come noop.js (isAvailable() -> false,
// letture -> array vuoto), senza mai lanciare.
//
// Health Connect esiste a runtime solo da Android 9 (API 28), anche se
// minSdkVersion dell'app è 26 (vedi gate approvato nel brief): isAvailable()
// interroga il servizio A RUNTIME (getSdkStatus), non deduce la
// disponibilità da Build.VERSION.SDK_INT. Su Android 8.0/8.1 l'unico
// effetto è isAvailable() -> false, l'app resta installabile e funzionante.
//
// API verificata contro node_modules/react-native-health-connect@4.1.3
// (lib/typescript/*.d.ts) E contro payload reali letti su dispositivo
// (build/permessi/lettura verificati — vedi cronologia). La logica di
// normalizzazione (buildDailyRecoveryRecords) è condivisa con healthKit.js
// e non dipende da questo SDK.
//
// SOLO SOLA LETTURA, SOLO i quattro tipi in scope. Nessun permesso
// ExerciseSession/Workout richiesto o letto.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { buildDailyRecoveryRecords } from "./recoveryAggregate";

const RECORD_TYPES = {
  hrv: "HeartRateVariabilityRmssd",
  restingHr: "RestingHeartRate",
  sleep: "SleepSession",
  weight: "Weight",
};

// Solo i quattro permessi in scope: nessuna estensione di TIPI di dato.
const READ_PERMISSIONS = Object.values(RECORD_TYPES).map((recordType) => ({ accessType: "read", recordType }));

// ─────────────────────────────────────────────────────────
// Permesso storico (opzionale) — READ_HEALTH_DATA_HISTORY
// ─────────────────────────────────────────────────────────
//
// Permesso speciale, non legato a un tipo di dato: Health Connect limita la
// LETTURA ai soli ultimi 30 giorni per un'app senza questo permesso,
// indipendentemente da quanto ampio sia il timeRangeFilter richiesto
// (verificato: una query readRecords() su dati reali più vecchi di 30gg
// tornava 0 record finché non è stato aggiunto separatamente). Era fuori
// dai quattro permessi in scope del brief: NON viene richiesto insieme ai
// quattro core in requestPermissions(), va proposto a parte con
// requestHistoryPermission() — la UI del passo 8 lo offrirà come opt-in.
// Senza, readRecoveryData() continua a funzionare: la finestra richiesta
// viene semplicemente troncata ai 30gg invece di fallire o restituire vuoto.
const HISTORY_PERMISSION = { accessType: "read", recordType: "ReadHealthDataHistory" };
const HISTORY_WINDOW_DAYS_WITHOUT_PERMISSION = 30;

// Diagnostica QA (12/08/2026), valori grezzi catturati su dispositivo reale:
//   sdk.requestPermission([HISTORY_PERMISSION]) -> []  (SEMPRE, anche
//     subito dopo che l'utente ha concesso dal dialogo reale — l'array
//     riflette solo le decisioni NUOVE di quella specifica interazione;
//     se il permesso risultava già deciso in precedenza, non c'è nulla
//     di "nuovo" da riportare e torna vuoto)
//   sdk.getGrantedPermissions() -> [4 tipi core, MAI ReadHealthDataHistory]
//     (confermato anche subito dopo una concessione riuscita)
// Non è quindi un problema di formato/confronto: l'SDK non espone in
// NESSUN modo lo stato di questo permesso speciale. L'unica via
// affidabile è verificarlo indirettamente (vedi probeHistoryAccess).
const HISTORY_GRANTED_KEY = "fightclub_hc_history_permission";

// Verifica indiretta: nessuna API dell'SDK riporta lo stato di
// ReadHealthDataHistory (vedi sopra), quindi si tenta una lettura reale
// in una finestra ANTECEDENTE i 30 giorni (oltre i quali Health Connect
// tronca silenziosamente senza il permesso, mai con un errore — vedi
// commento sopra su HISTORY_WINDOW_DAYS_WITHOUT_PERMISSION). Se anche
// un solo tipo restituisce almeno un record in quella finestra, il
// permesso è realmente attivo.
//
// Prova tutti e quattro i tipi in parallelo, non solo uno: al momento
// della chiamata non è detto quali dei quattro permessi core siano
// concessi (vedi Scenario permessi parziali), quindi limitarsi a un
// solo tipo rischierebbe un falso negativo per assenza di QUEL
// permesso, non per assenza dello storico.
//
// Falso negativo noto e accettato: un utente senza alcun dato più
// vecchio di 30gg (dispositivo nuovo) risulta "storico non attivo"
// anche a permesso concesso — ma è innocuo, perché il risultato
// pratico (nessun dato oltre i 30gg) è identico in entrambi i casi.
// Non esiste invece il caso opposto (falso positivo): un permesso
// davvero assente non può mai restituire record oltre la finestra.
const PROBE_WINDOW_DAYS_FROM = 90;
const PROBE_WINDOW_DAYS_TO = 31; // esclude gli ultimi 30gg: lì l'accesso è comunque garantito, non prova nulla
async function probeHistoryAccess(sdk) {
  try {
    const toDate = new Date(Date.now() - PROBE_WINDOW_DAYS_TO * 86400000);
    const fromDate = new Date(Date.now() - PROBE_WINDOW_DAYS_FROM * 86400000);
    const timeRangeFilter = { operator: "between", startTime: fromDate.toISOString(), endTime: toDate.toISOString() };
    const results = await Promise.all(
      Object.values(RECORD_TYPES).map((recordType) =>
        sdk.readRecords(recordType, { timeRangeFilter }).catch(() => ({ records: [] }))
      )
    );
    return results.some((r) => Array.isArray(r?.records) && r.records.length > 0);
  } catch {
    return false;
  }
}

async function getStoredHistoryGranted() {
  try {
    return (await AsyncStorage.getItem(HISTORY_GRANTED_KEY)) === "true";
  } catch {
    return false;
  }
}

async function setStoredHistoryGranted(granted) {
  try {
    await AsyncStorage.setItem(HISTORY_GRANTED_KEY, granted ? "true" : "false");
  } catch {
    // Persistenza best-effort: un fallimento qui non deve interrompere
    // il flusso di richiesta permessi già concluso con successo.
  }
}

// SDK_AVAILABLE = 3: valore noto dell'API Android nativa HealthConnectClient
// (getSdkStatus restituisce un numero grezzo, il pacchetto non esporta una
// costante JS per confrontarlo — verificato: SdkAvailabilityStatus non
// esiste tra gli export di react-native-health-connect).
const SDK_AVAILABLE = 3;

let _sdk; // undefined = non ancora tentato, false = non disponibile, altrimenti il modulo
function getSdk() {
  if (_sdk !== undefined) return _sdk;
  try {
    _sdk = require("react-native-health-connect");
  } catch {
    _sdk = false;
  }
  return _sdk;
}

// initialize() va chiamata una volta prima di qualsiasi altra operazione
// (getSdkStatus escluso, che è la query di disponibilità stessa). Memoizza
// il risultato per evitare inizializzazioni ripetute ad ogni chiamata.
let _initPromise = null;
function ensureInitialized(sdk) {
  if (!_initPromise) _initPromise = sdk.initialize().catch(() => false);
  return _initPromise;
}

export async function isAvailable() {
  const sdk = getSdk();
  if (!sdk) return false;
  try {
    const status = await sdk.getSdkStatus();
    if (status !== SDK_AVAILABLE) return false;
    return await ensureInitialized(sdk);
  } catch {
    return false;
  }
}

// Elenco dei tipi per cui il permesso di lettura è concesso. Include
// "ReadHealthDataHistory" se il permesso storico risulta concesso dal
// nostro flag persistito (vedi sopra) — così la UI del passo 8 può
// interrogare un'unica funzione per sapere se offrirlo già attivo o come
// opt-in ancora da richiedere.
export async function getGrantedPermissions() {
  const sdk = getSdk();
  if (!sdk) return [];
  try {
    if (!(await isAvailable())) return [];
    const granted = await sdk.getGrantedPermissions();
    const types = Array.isArray(granted) ? granted.map((p) => p.recordType || p) : [];
    if (await getStoredHistoryGranted()) types.push("ReadHealthDataHistory");
    return types;
  } catch {
    return [];
  }
}

// Richiede SOLO i quattro permessi core (HRV, FC a riposo, sonno, peso).
// Il permesso storico è separato, vedi requestHistoryPermission().
export async function requestPermissions() {
  const sdk = getSdk();
  if (!sdk) return false;
  try {
    if (!(await isAvailable())) return false;
    const granted = await sdk.requestPermission(READ_PERMISSIONS);
    return Array.isArray(granted) && granted.length > 0;
  } catch {
    return false;
  }
}

// Richiede il permesso storico, a parte e solo su azione esplicita
// dell'utente (mai insieme ai quattro core). Mostra il dialogo dedicato di
// Health Connect ("Consentire l'accesso ai dati precedenti?") SOLO se il
// permesso non è ancora stato deciso — altrimenti l'activity si apre e
// si richiude da sola, senza interazione (verificato). Il risultato
// viene anche persistito per essere esposto da getGrantedPermissions()
// in seguito.
//
// Non fidarsi del valore restituito da sdk.requestPermission(): torna
// SEMPRE [] quando il permesso risultava già deciso in precedenza
// (diagnostica QA 12/08/2026, valori grezzi catturati su dispositivo
// reale — vedi commento su HISTORY_GRANTED_KEY), quindi lo si chiama
// solo per mostrare l'eventuale dialogo, e si verifica l'esito reale
// con probeHistoryAccess().
export async function requestHistoryPermission() {
  const sdk = getSdk();
  if (!sdk) return false;
  try {
    if (!(await isAvailable())) return false;
    await sdk.requestPermission([HISTORY_PERMISSION]);
    const isGranted = await probeHistoryAccess(sdk);
    await setStoredHistoryGranted(isGranted);
    return isGranted;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────
// Riduzione volume + paginazione (12/08/2026, FC a riposo corretta lo
// stesso giorno — vedi sotto)
// ─────────────────────────────────────────────────────────
//
// Diagnostica QA sul dispositivo reale (vedi correzione BUG storico
// sopra): una singola sorgente (Zepp/Huami) produce 1000 record HRV in
// soli 14gg — esattamente il taglio di una pagina, MAI seguita
// (pageToken ignorato). Il fabbisogno reale per HRV è UN campione al
// giorno (quello scelto da pickWakeWindowSample in
// recoveryAggregate.js, entro la finestra di risveglio o il fallback
// fisso 04-11 locali) — interrogare l'intera finestra multi-giorno per
// poi scartare quasi tutto è spreco, ed è la causa diretta del rischio
// di paginazione.
//
// FC a riposo NON segue più questa logica (un primo tentativo le
// applicava lo stesso taglio orario di HRV — vedi la sua query più
// sotto per il perché era sbagliato e cosa fa ora).

// Finestra di query giornaliera per HRV: 03-12 locale copre per intero
// il fallback fisso di recoveryAggregate.js (04-11, un'ora di margine
// per lato) e la finestra di risveglio ±2h per la stragrande
// maggioranza dei risvegli plausibili. Un risveglio dopo le 10
// (wake-window che sconfina oltre le 12) resterebbe parzialmente
// fuori: trade-off accettato, il fallback fisso non è mai intaccato.
const MORNING_QUERY_START_HOUR = 3;
const MORNING_QUERY_END_HOUR = 12;

// Elenca ogni giorno di calendario LOCALE in [fromDate, toDate], estremi
// inclusi. Ancorato alla mezzanotte locale di ciascun giorno, non a
// multipli di 24h da fromDate: un fromDate/toDate a metà giornata copre
// comunque il giorno intero, come serve per le finestre 03-12 sotto.
function eachLocalDay(fromDate, toDate) {
  const days = [];
  const cursor = new Date(fromDate);
  cursor.setHours(0, 0, 0, 0);
  const last = new Date(toDate);
  last.setHours(0, 0, 0, 0);
  while (cursor <= last) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

// Finestra 03:00-12:00 locale del giorno indicato, ritagliata dentro
// [minDate, maxDate] (il range effettivamente richiesto a
// readRecoveryData). Ritorna null se il ritaglio produce una finestra
// vuota o invertita (giorno di bordo il cui 03-12 locale cade
// interamente fuori dal range richiesto) — il chiamante salta la query
// per quel giorno, invece di mandare un timeRangeFilter malformato.
function morningWindow(day, minDate, maxDate) {
  const start = new Date(day);
  start.setHours(MORNING_QUERY_START_HOUR, 0, 0, 0);
  const end = new Date(day);
  end.setHours(MORNING_QUERY_END_HOUR, 0, 0, 0);
  const clampedStart = start < minDate ? minDate : start;
  const clampedEnd = end > maxDate ? maxDate : end;
  if (clampedStart >= clampedEnd) return null;
  return { start: clampedStart, end: clampedEnd };
}

// Rete di sicurezza paginazione: nessuna query in questo file dovrebbe
// più avvicinarsi al limite di una pagina dopo il taglio giornaliero
// sopra, ma sonno/peso restano su query a finestra intera (vedi sotto,
// pochi record per natura) e una sorgente futura più fitta di Zepp
// potrebbe comunque saturare una pagina. Segue pageToken finché la
// risposta ne restituisce uno, fino a MAX_PAGES; oltre quel tetto si
// ferma e logga, mai un loop illimitato. ascendingOrder:false esplicito
// (mai assunto — verificato che l'SDK non lo documenta come default):
// se il tetto scatta, si perdono i record PIÙ VECCHI della pagina non
// letta, mai i più recenti, che sono quelli che contano per la baseline.
const MAX_PAGES = 20;
async function readAllPages(sdk, recordType, timeRangeFilter) {
  const records = [];
  let pageToken;
  let pages = 0;
  do {
    const options = { timeRangeFilter, ascendingOrder: false };
    if (pageToken) options.pageToken = pageToken;
    const res = await sdk.readRecords(recordType, options).catch(() => ({ records: [] }));
    records.push(...(res?.records || []));
    pageToken = res?.pageToken;
    pages += 1;
  } while (pageToken && pages < MAX_PAGES);
  if (pageToken) {
    console.log(`[health] readAllPages(${recordType}): tetto di ${MAX_PAGES} pagine raggiunto, record più vecchi di questa finestra scartati`);
  }
  return records;
}

export async function readRecoveryData(fromDate, toDate) {
  const sdk = getSdk();
  if (!sdk) return [];
  try {
    if (!(await isAvailable())) return [];

    // Senza il permesso storico, Health Connect nega silenziosamente i
    // dati oltre i 30gg (tornano record vuoti, non un errore) — la
    // finestra richiesta viene quindi troncata qui, esplicitamente, invece
    // di lasciare che la query fallisca in modo silenzioso e sorprendente.
    let effectiveFromDate = fromDate;
    if (!(await getStoredHistoryGranted())) {
      const cutoff = new Date(toDate.getTime() - HISTORY_WINDOW_DAYS_WITHOUT_PERMISSION * 86400000);
      if (fromDate < cutoff) effectiveFromDate = cutoff;
    }

    // Finestra dell'intera richiesta — usata da FC a riposo, sonno e
    // peso (vedi sotto perché FC a riposo, a differenza di HRV, non usa
    // il taglio giornaliero 03-12).
    const wholeWindowFilter = {
      operator: "between",
      startTime: effectiveFromDate.toISOString(),
      endTime: toDate.toISOString(),
    };

    // HRV: una query PER GIORNO limitata alla finestra 03-12 locale
    // (vedi sopra), non un'unica query sull'intera finestra — riduce il
    // volume da migliaia a poche decine di record per giorno, rendendo
    // la paginazione un non-problema nella pratica (resta comunque
    // gestita da readAllPages come rete di sicurezza). Confermato sul
    // dispositivo reale: senza il taglio, 1000 record TRONCATI in
    // 14gg da un'unica sorgente; con il taglio, 4891 record COMPLETI
    // in 31gg, nessuna pagina mai satura.
    const days = eachLocalDay(effectiveFromDate, toDate);
    const hrvByDay = await Promise.all(
      days.map((day) => {
        const win = morningWindow(day, effectiveFromDate, toDate);
        if (!win) return [];
        const timeRangeFilter = { operator: "between", startTime: win.start.toISOString(), endTime: win.end.toISOString() };
        return readAllPages(sdk, RECORD_TYPES.hrv, timeRangeFilter);
      })
    );
    const hrvRecords = hrvByDay.flat();

    // FC a riposo: query sull'intera finestra, NESSUN taglio orario (a
    // differenza di HRV sopra — un primo tentativo applicava lo stesso
    // taglio 03-12 anche qui, ma era concettualmente sbagliato). In
    // Health Connect è un AGGREGATO GIORNALIERO calcolato dalla
    // sorgente, non un campione puntuale misurato al risveglio: il
    // timestamp è l'ora di SCRITTURA del valore, non di misurazione
    // (verificato sul dispositivo reale: Zepp scrive alle 21:59 locali,
    // fuori da qualunque finestra di risveglio plausibile — con il
    // taglio 03-12 ne restavano 4 su 31gg invece di uno al giorno).
    // Circa un record al giorno per natura: nessun rischio di
    // paginazione, nessun motivo di frazionare. L'attribuzione al
    // giorno e la scelta fra più scritture nello stesso giorno
    // avvengono in recoveryAggregate.js (ultimo vince, non più
    // selezione per prossimità al risveglio — vedi lì).
    const restingHrRecords = await readAllPages(sdk, RECORD_TYPES.restingHr, wholeWindowFilter);

    // Sonno e peso: pochi record anche su finestre ampie (una o due
    // sessioni a notte, una manciata di pesate) — nessun motivo di
    // frazionarli per giorno, la query sull'intera finestra resta la
    // scelta giusta.
    const [sleepRecords, weightRecords] = await Promise.all([
      readAllPages(sdk, RECORD_TYPES.sleep, wholeWindowFilter),
      readAllPages(sdk, RECORD_TYPES.weight, wholeWindowFilter),
    ]);

    const hrvSamples = hrvRecords.map((r) => ({
      measuredAt: r.time,
      value: r.heartRateVariabilityMillis,
      metric: "rmssd", // Health Connect espone sempre rMSSD per questo tipo, mai SDNN
    }));
    const restingHrSamples = restingHrRecords.map((r) => ({
      measuredAt: r.time,
      value: r.beatsPerMinute,
    }));
    const sleepSessions = sleepRecords.map((r) => ({
      startedAt: r.startTime,
      endedAt: r.endTime,
      startZoneOffsetSeconds: r.startZoneOffset?.totalSeconds,
      endZoneOffsetSeconds: r.endZoneOffset?.totalSeconds,
      // Verificato contro un payload reale (sessione a cavallo di
      // mezzanotte, 43 segmenti): {stage, startTime, endTime}, codici
      // Android standard (0=UNKNOWN, 1=AWAKE, 2=SLEEPING, 3=OUT_OF_BED,
      // 4=LIGHT, 5=DEEP, 6=REM). Non tutte le sessioni li includono.
      stages: Array.isArray(r.stages)
        ? r.stages.map((s) => ({ stage: s.stage, startedAt: s.startTime, endedAt: s.endTime }))
        : [],
    }));
    const weightSamples = weightRecords.map((r) => ({
      measuredAt: r.time,
      value: r.weight?.inKilograms, // MassResult in lettura, non il Mass {value,unit} di scrittura
    }));

    return buildDailyRecoveryRecords({
      hrvSamples,
      restingHrSamples,
      sleepSessions,
      weightSamples,
      source: "healthconnect",
    });
  } catch {
    return [];
  }
}
