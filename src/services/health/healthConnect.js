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

    const timeRangeFilter = {
      operator: "between",
      startTime: effectiveFromDate.toISOString(),
      endTime: toDate.toISOString(),
    };

    const [hrvRaw, restingHrRaw, sleepRaw, weightRaw] = await Promise.all([
      sdk.readRecords(RECORD_TYPES.hrv, { timeRangeFilter }).catch(() => ({ records: [] })),
      sdk.readRecords(RECORD_TYPES.restingHr, { timeRangeFilter }).catch(() => ({ records: [] })),
      sdk.readRecords(RECORD_TYPES.sleep, { timeRangeFilter }).catch(() => ({ records: [] })),
      sdk.readRecords(RECORD_TYPES.weight, { timeRangeFilter }).catch(() => ({ records: [] })),
    ]);

    const hrvSamples = (hrvRaw?.records || []).map((r) => ({
      measuredAt: r.time,
      value: r.heartRateVariabilityMillis,
      metric: "rmssd", // Health Connect espone sempre rMSSD per questo tipo, mai SDNN
    }));
    const restingHrSamples = (restingHrRaw?.records || []).map((r) => ({
      measuredAt: r.time,
      value: r.beatsPerMinute,
    }));
    const sleepSessions = (sleepRaw?.records || []).map((r) => ({
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
    const weightSamples = (weightRaw?.records || []).map((r) => ({
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
