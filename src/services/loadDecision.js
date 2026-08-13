// src/services/loadDecision.js
//
// Motore decisionale sul carico di allenamento — regole esplicite, non IA.
// L'AI Coach riceve solo la decisione già presa (vedi Fase 3, buildPrompt in
// aiCoach.js), mai i valori grezzi che la producono: decisioni riproducibili,
// spiegabili, verificabili. Funzione pura: nessuna I/O, nessuna persistenza,
// nessuna dipendenza da new Date() PER LA LOGICA DELLE REGOLE — l'ancora
// temporale è il record più recente presente negli input (vedi
// resolveAnchorDateKey), stesso principio già usato da recoveryBaseline.js.
//
// Deviazione dalla firma proposta nel brief: aggiunto il parametro opzionale
// `checkIn` (assente nella firma originale). La Regola 2 richiede la fatica
// soggettiva grezza (1-5) del check-in odierno — non è recuperabile in modo
// affidabile da readiness.components.fatigue, che è già normalizzato/invertito
// e arrotondato (fatigueComp = (6-fatica)/5, poi *100 e arrotondato in
// athleteProfile.js): ricavare la fatica grezza da lì richiederebbe invertire
// una formula privata di un altro modulo, fragile a qualunque futura modifica
// dei pesi. Il check-in oggettivo (fatica/sonno/dolori) è già disponibile via
// aiCoach.js — passarlo direttamente è la scelta più robusta.

// ─────────────────────────────────────────────────────────
// SOGLIE — una costante nominata per ciascuna, nell'ordine delle regole
// ─────────────────────────────────────────────────────────

// Regola 1 — pattern da possibile malattia incipiente (HRV depresso
// persistente + FC a riposo elevata: il pattern classico di infezione in
// incubazione, letteratura sul monitoraggio HRV — es. Plews et al.). Soglie
// di partenza ragionevoli, NON calibrate su dati reali di FightClub: da
// tarare (vedi test con lo storico reale).
const HRV_Z_SICK_THRESHOLD = -1;
const HRV_SICK_CONSECUTIVE_DAYS = 3;
const RESTING_HR_SICK_PCT = 0.05; // +5% sopra la baseline EWMA

// Regola 2 — crollo acuto: HRV oggi molto basso + sonno oggettivo corto +
// fatica soggettiva alta. Stesso disclaimer di taratura della Regola 1.
const HRV_Z_ACUTE_THRESHOLD = -1.5;
const SLEEP_ACUTE_HOURS = 6;
const FATIGUE_ACUTE_MIN = 4; // scala 1-5 del check-in soggettivo (aiCoach.js)

// Regola 4 — ACWR (Acute:Chronic Workload Ratio), variante EWMA.
//
// Qui ACWR = atl/ctl da trainingLoad.current — NON un nuovo campo di
// trainingLoad.js (decisione esplicita: si deriva qui, quel file non si
// tocca). È la variante EWMA dell'ACWR classico (Hulin/Gabbett, medie
// mobili semplici 7gg/28gg): preferibile perché priva delle discontinuità
// a gradino che le medie mobili semplici introducono quando un giorno di
// carico estremo esce di colpo dalla finestra.
//
// Differenza rilevante dallo standard: il "cronico" qui è CTL a 42 giorni
// (CTL_DAYS in trainingLoad.js), non 28 come nell'ACWR classico. Una
// finestra cronica più lunga si muove più lentamente, quindi il rapporto
// atl/ctl oscilla meno di un ACWR 7:28 classico — a parità di soglia
// numerica, 1.5 qui corrisponde a uno scostamento acuto/cronico PIÙ
// marcato di quanto rappresenti nello standard. La soglia 1.5 è quindi
// presa dalla letteratura solo come punto di partenza plausibile, non
// come valore equivalente: è un parametro DA TARARE su dati reali, non
// una legge fisica (vedi anche nota della Regola 4 nel brief).
//
// Corretto il 13/08/2026 — la regola è a EVENTO, non a stato. Con atl a
// 7gg e ctl a 42gg, una volta sopra soglia l'ACWR ci resta per giorni
// anche se l'atleta riduce (verificato sui dati reali: 6 giorni
// consecutivi identici) — un motore che punisce anche chi gli dà retta
// smette di essere utile. Confronta oggi con IERI (da
// trainingLoad.series, che porta già ctl/atl per ciascun giorno):
//   - ieri sotto/sconosciuto, oggi sopra  -> scatta (acwr_elevated, il
//     superamento è l'evento)
//   - resta sopra ma oggi < ieri (in discesa) -> NON scatta: l'atleta sta
//     già correggendo, non c'è nulla di nuovo da segnalare
//   - resta sopra e oggi >= ieri (in salita o piatto) -> scatta comunque,
//     ma con reason diverso (acwr_still_rising): non è più un
//     superamento, è un peggioramento continuato
const ACWR_HIGH_THRESHOLD = 1.5;

// Regola 5 — TSB molto negativo (stessa fonte di tsbStatus() in
// trainingLoad.js: TrainingPeaks / Seiler 2010, "< -20" già segnalato come
// sovrallenamento lì; qui -30 è una soglia più severa, specifica per
// l'azione "reduce" del motore, non per la sola interpretazione testuale).
const TSB_LOW_THRESHOLD = -30;
// Regola 7 — TSB moderatamente negativo, soglia più permissiva della 5,
// usata solo in combinazione con un trend HRV già in calo.
const TSB_MILD_LOW_THRESHOLD = -10;
//
// Perché Regola 4 (ACWR) e Regola 5 (TSB) sembrano ridondanti ma non lo
// sono: ACWR è RELATIVO al livello dell'atleta, TSB è ASSOLUTO. Con la
// matematica di trainingLoad.js, TSB = CTL - ATL; se ACWR = atl/ctl = 1.5,
// allora ATL = 1.5·CTL e TSB = CTL - 1.5·CTL = -0.5·CTL. Le due soglie
// (ACWR 1.5, TSB -30) coincidono nello stesso istante SOLO quando
// -0.5·CTL = -30, cioè CTL = 60. Sotto CTL 60 (atleta con fitness/CTL
// basso — principiante o a inizio ciclo), ACWR raggiunge 1.5 quando TSB è
// ancora più alto di -30: la Regola 4 scatta PRIMA, proteggendo chi ha
// poca base cronica da un salto di carico relativamente grande anche se
// il debito di forma assoluto non è ancora profondo. Sopra CTL 60 (atleta
// avanzato con base cronica alta), TSB raggiunge -30 quando ACWR è ancora
// sotto 1.5: la Regola 5 scatta PRIMA. Vanno tenute entrambe: ciascuna
// protegge una fascia di atleta che l'altra, da sola, lascerebbe scoperta.

// Regola 6 — sparring recente, finestra di non-idoneità al lavoro
// neurale massimale.
const SPARRING_LOOKBACK_HOURS = 48;

// Regola 8 — sonno oggettivo sotto la BASELINE PERSONALE, non una soglia
// assoluta. Corretto il 13/08/2026: con una soglia assoluta (6.5h) la
// regola scattava 9 giorni consecutivi sui dati reali — descriveva
// l'abitudine dell'atleta, non un evento. Un segnale sempre vero non è
// un segnale. Ora confronta la media a SLEEP_CHRONIC_DAYS giorni con
// baseline.sleep.meanTotalMin (la media personale, già calcolata da
// computeRecoveryBaseline): scatta solo se il sonno recente è
// SLEEP_RELATIVE_DEFICIT_PCT sotto quella baseline, non sotto un numero
// fisso uguale per tutti.
const SLEEP_RELATIVE_DEFICIT_PCT = 0.15; // 15% sotto la propria media
const SLEEP_CHRONIC_DAYS = 3;
// Pavimento assoluto separato: un atleta la cui baseline personale è già
// bassa (es. abituato a 5.5h) non verrebbe mai intercettato dal solo
// confronto relativo. Sotto questa soglia in valore assoluto, il confronto
// con la baseline non basta più — è un flag distinto
// (chronic_severe_sleep_deficit), NON una regola della cascata: non
// determina da solo un livello, si aggiunge a qualunque esito la cascata
// produca (stesso trattamento del taglio peso più sotto).
const SLEEP_ABSOLUTE_FLOOR_HOURS = 5;

// Regola 9 — finestra di progressione, RELATIVA non assoluta. Corretto il
// 13/08/2026: con TSB > +5 assoluto la regola non è MAI scattata sui dati
// reali (0/15 giorni valutabili in 30gg) — non era la soglia sbagliata,
// era il concetto. Un TSB assolutamente positivo richiede giorni di
// riposo quasi totale: usarlo come cancello per progredire descrive uno
// STATO DI RIPOSO, non di PRONTEZZA. Un atleta che si allena con
// continuità non lo raggiunge quasi mai, e un motore che può solo
// frenare viene ignorato. Bompa (periodizzazione a carico ondulatorio):
// un'onda non richiede di tornare a zero per risalire, richiede che la
// direzione sia giusta rispetto a dove si era pochi giorni prima.
//
// Nuova condizione: TSB IN MIGLIORAMENTO rispetto ai giorni immediatamente
// precedenti (TSB_IMPROVEMENT_LOOKBACK_DAYS), non il suo valore assoluto —
// vedi meanTsbPreviousDays. HRV invariato (era già la condizione meno
// restrittiva, 5/15 giorni). ACWR: tolto il pavimento 0.8 — un ACWR basso
// significa carico acuto contenuto rispetto al cronico, che non è di per
// sé un motivo per NON progredire (a differenza di un ACWR alto, che lo è
// — vedi Regola 4). Resta solo il tetto, per evitare di progredire mentre
// il carico acuto sta già correndo verso la soglia di allerta.
//
// NON TARATA su dati reali (13/08/2026). Il backtest disponibile (20 giorni,
// CTL 1.5-6.5, 16 giorni di riposo su 20) non permette di validare i 3 punti:
// verificata la formula esatta (TSB oggi − media TSB dei 3gg precedenti) su
// tutti i giorni valutabili di quello storico, il massimo raggiunto è stato
// +0.77 (durante il riposo) — MAI vicino a 3, ma quello storico non è un
// campione valido per tarare la soglia (vedi CTL_BUILDING_BASE_THRESHOLD
// sotto: sotto quel CTL la regola non va comunque valutata). Non abbassare
// questa soglia sulla base di quei dati: farlo avrebbe fatto scattare
// "progress" durante 13 giorni di riposo totale, un errore concettualmente
// peggiore dello zero attuale. Da rivedere quando esisteranno 4+ settimane
// di allenamento continuo con CTL sopra CTL_BUILDING_BASE_THRESHOLD*2.5 (circa
// 25, il CTL di regime con 3 sedute/settimana da ~65 TSS).
const TSB_IMPROVEMENT_MIN_POINTS = 3; // punti minimi di risalita per contare come "in miglioramento" — NON TARATA, vedi sopra
const TSB_IMPROVEMENT_LOOKBACK_DAYS = 3;
const HRV_Z_PROGRESS_MIN = -0.5;
const ACWR_PROGRESS_MAX = 1.3;
const PROGRESS_VOLUME_PCT = 5; // vedi nota originale: estremo inferiore del range 5-8% del brief, scelta conservativa

// Pavimento CTL — corretto il 13/08/2026 (prima bozza: 10). "progress" non
// ha senso sotto una base cronica minima: con CTL 1.5-6.5 (vedi backtest
// 20gg) l'atleta sta letteralmente ripartendo da zero, non progredendo.
// Sotto questa soglia l'obiettivo è la REGOLARITÀ, non l'aumento: la
// cascata emette "maintain" con reason "building_base" invece di valutare
// le condizioni di progressione sopra. 10 e non un valore più alto (es. 15,
// scartato): con 3 sedute/settimana da ~65 TSS il CTL di regime si assesta
// intorno a 25-30 (τ=42gg, vedi trainingLoad.js) — una soglia a 15
// terrebbe un atleta che si allena con regolarità in "building_base" per
// quasi un mese, troppo a lungo per un messaggio che dovrebbe sparire non
// appena la continuità è dimostrata.
const CTL_BUILDING_BASE_THRESHOLD = 10;

// Taglio peso — vincolo di sicurezza TRASVERSALE, non una regola della
// cascata: si valuta sempre, e se il livello scelto dalla cascata sarebbe
// stato "progress" lo declassa a "maintain" (mai un divieto totale come
// "rest": il taglio peso aggressivo è un segnale di attenzione sulla
// traiettoria, non necessariamente uno stato acuto che giustifichi lo stop).
// Area a maggior potenziale di danno di tutta l'app (atleti giovani, sport
// da combattimento, disturbi alimentari): il motore rifiuta la traiettoria,
// non la ottimizza — nessuna indicazione su COME accelerare il calo, mai.
const WEIGHT_CUT_PCT_PER_WEEK = 0.015; // 1.5% del peso corporeo/settimana

// Confidence: sotto questa soglia (per-metrica, sampleCount) il motore non
// prescrive (vedi GATE "learning"). Duplica intenzionalmente le soglie di
// recoveryBaseline.js (confidenceForSampleCount: none<7, low 7-13, medium
// 14-27, high>=28) — quella funzione non è esportata da lì, e questo è un
// file nuovo e isolato: se le soglie di recoveryBaseline.js cambiano,
// questo commento è il punto da aggiornare in coppia.
const CONFIDENCE_MEDIUM_SAMPLE_THRESHOLD = 14;

// Chiavi i18n per l'headline (Fase 2 aggiungerà le traduzioni — qui sono
// solo le chiavi, mai testo, come richiesto dal brief).
const HEADLINE = {
  restIllness: "loadDecision.headline.restIllness",
  restAcute: "loadDecision.headline.restAcute",
  taper: "loadDecision.headline.taper",
  acwrHigh: "loadDecision.headline.acwrHigh",
  tsbLow: "loadDecision.headline.tsbLow",
  sparring: "loadDecision.headline.sparring",
  hrvTrendLowTsb: "loadDecision.headline.hrvTrendLowTsb",
  sleepDeficit: "loadDecision.headline.sleepDeficit",
  progress: "loadDecision.headline.progress",
  buildingBase: "loadDecision.headline.buildingBase",
  maintainDefault: "loadDecision.headline.maintainDefault",
  learning: "loadDecision.headline.learning",
};

// ─────────────────────────────────────────────────────────
// Helper puri
// ─────────────────────────────────────────────────────────

// Sposta una chiave data "YYYY-MM-DD" di N giorni, ancorato a mezzogiorno
// UTC — stessa tecnica di recoveryBaseline.js (shiftDateKey, non esportata
// da lì), per non attraversare mai un cambio di data per arrotondamento.
function shiftDateKey(dateKey, deltaDays) {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────
// Lettura di trainingLoad.series per data (nota 13/08/2026)
// ─────────────────────────────────────────────────────────
//
// Ipotesi iniziale (13/08/2026, poi SMENTITA, vedi sotto): trainingLoad.js
// chiavizza ogni entry della serie con cursor.toISOString().slice(0,10)
// (UTC), mentre il cursore avanza per giorni di calendario LOCALE — con
// un fuso a est di Greenwich (es. Europe/Rome) la mezzanotte locale cade
// nel giorno UTC precedente, quindi si era dedotto che ogni entry.date
// fosse sistematicamente un giorno indietro rispetto al giorno locale
// che il cursore intendeva rappresentare, e si era introdotto uno shift
// di +1 giorno per "correggere" la chiave prima di ogni lookup.
//
// Verifica empirica sui VALORI (non sulle sole etichette), fatta perché
// il backtest post-fix continuava a mostrare un'anomalia sospetta
// (acwr_still_rising invece di acwr_elevated sul primo giorno "reduce"):
// trainingLoad.js usa la STESSA chiave (cursor.toISOString().slice(0,10))
// sia per SALVARE l'entry sia per CERCARE il tss del giorno in tssMap
// (tssMap.get(key)). tssMap è popolato dal timestamp grezzo delle
// sessioni, che per questo storico coincide con la data locale (0/20
// divergenze, verificato). I due sfasamenti (chiave di salvataggio e
// chiave di lettura) si applicano nello STESSO modo e si cancellano a
// vicenda: letta a valore nominale (nessuno shift), entry.date CORRISPONDE
// già al giorno di calendario locale corretto. Confermato con un test
// mirato (sessioni sintetiche, un giorno/tss distinto ciascuno): ogni
// tss finiva esattamente sotto la propria data, senza buchi né
// accorpamenti tra giorni adiacenti.
//
// Lo shift +1 introdotto per primo era quindi un baco che io stesso avevo
// aggiunto, non una correzione: disallineava un'etichetta che era già
// corretta. Rimosso. trainingLoad.series si legge qui a valore nominale.
// (trainingLoad.js resta comunque non toccato, come richiesto — questa
// nota resta solo a futura memoria per non ripetere lo stesso errore.)

// Mappa trainingLoad.series per data, così le regole che devono guardare
// un giorno diverso da "oggi" (Regola 4: ieri: Regola 9: media 3gg prima)
// possono fare un lookup diretto invece di uno scan lineare ripetuto.
// Nessuno shift: entry.date è già la chiave di calendario locale corretta
// (vedi nota sopra).
function buildLocalDateKeyedSeries(trainingLoad) {
  const series = Array.isArray(trainingLoad?.series) ? trainingLoad.series : [];
  const map = new Map();
  for (const entry of series) {
    if (!entry?.date) continue;
    map.set(entry.date, entry);
  }
  return map;
}

// Ancora temporale del motore: la data più recente tra la serie di
// trainingLoad (rietichettata, vedi sopra — la chiave più alta della
// mappa è "oggi" per costruzione: la serie è generata giorno per giorno
// senza buchi) e recoveryRecords (record più recente). Mai new Date().
// null se nessuna delle due fonti ha dati — le regole ancorate a una
// data semplicemente non valutano, non lanciano.
function resolveAnchorDateKey(seriesMap, recoveryRecords) {
  let tlDate = null;
  for (const key of seriesMap.keys()) if (!tlDate || key > tlDate) tlDate = key;
  const rrDate = Array.isArray(recoveryRecords) && recoveryRecords.length
    ? recoveryRecords.reduce((max, r) => (r?.date && (!max || r.date > max) ? r.date : max), null)
    : null;
  if (tlDate && rrDate) return tlDate > rrDate ? tlDate : rrDate;
  return tlDate || rrDate || null;
}

// ACWR come atl/ctl (vedi commento esteso sopra ACWR_HIGH_THRESHOLD). null
// se ctl non è positivo (storico troppo corto per un cronico significativo)
// — mai NaN/Infinity propagato.
function computeAcwr(trainingLoad) {
  const ctl = Number(trainingLoad?.current?.ctl);
  const atl = Number(trainingLoad?.current?.atl);
  if (!Number.isFinite(ctl) || ctl <= 0 || !Number.isFinite(atl)) return null;
  return atl / ctl;
}

// ACWR di una entry della serie già recuperata (vedi buildLocalDateKeyedSeries
// / seriesMap) — non serve ricalcolare nulla, solo applicare la stessa
// formula di computeAcwr a una riga diversa da "oggi". null se l'entry è
// assente o ctl non è positivo — stessa cautela di computeAcwr.
function acwrForSeriesEntry(entry) {
  const ctl = Number(entry?.ctl);
  const atl = Number(entry?.atl);
  if (!Number.isFinite(ctl) || ctl <= 0 || !Number.isFinite(atl)) return null;
  return atl / ctl;
}

// Media del TSB sui `days` giorni PRECEDENTI `anchorKey` (non incluso).
// Richiede un valore per OGNI giorno della finestra — stesso principio
// delle altre medie multi-giorno di questo file: un buco rende la media
// inaffidabile, si preferisce non calcolarla piuttosto che ignorarlo.
function meanTsbPreviousDays(seriesMap, anchorKey, days) {
  const values = [];
  for (let i = 1; i <= days; i++) {
    const entry = seriesMap.get(shiftDateKey(anchorKey, -i));
    const tsb = Number(entry?.tsb);
    if (!Number.isFinite(tsb)) return null;
    values.push(tsb);
  }
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// z-score dell'HRV di un giorno specifico, usando ewma/sd già calcolati da
// computeRecoveryBaseline (baseline.hrv) — NON un nuovo calcolo statistico,
// solo l'applicazione della stessa baseline a un giorno diverso da "oggi".
// Richiede lo stesso metric (sdnn/rmssd) della baseline: un campione
// dell'altra metrica non è confrontabile (stessa regola di
// recoveryBaseline.js/chooseMajorityHrvMetric). null se dato mancante,
// metrica diversa, o sd non positiva (nessuna dispersione misurabile).
function hrvZForDate(recoveryRecords, baseline, dateKey) {
  const rec = recoveryRecords.find((r) => r?.date === dateKey);
  const value = rec?.hrv?.value;
  const metric = rec?.hrv?.metric;
  const { ewma, sd, metric: baselineMetric } = baseline?.hrv || {};
  if (!Number.isFinite(value) || metric !== baselineMetric) return null;
  if (!Number.isFinite(ewma) || !Number.isFinite(sd) || sd <= 0) return null;
  return (value - ewma) / sd;
}

// Regola 1: HRV_Z_SICK_THRESHOLD (o sotto) per HRV_SICK_CONSECUTIVE_DAYS
// giorni di calendario CONSECUTIVI, ancorati a `anchorKey` (oggi, ieri,
// l'altro ieri...). Un giorno mancante (nessun record, o record ma
// z non calcolabile) interrompe la sequenza — meglio non far scattare la
// regola più severa dell'intero motore su un buco nei dati che rischiare
// un falso positivo. Nessun controllo su TUTTA la storia: solo gli ultimi
// N giorni consecutivi da `anchorKey`.
function hrvDepressedForConsecutiveDays(recoveryRecords, baseline, anchorKey, days) {
  for (let i = 0; i < days; i++) {
    const key = shiftDateKey(anchorKey, -i);
    const z = hrvZForDate(recoveryRecords, baseline, key);
    if (z === null || z >= HRV_Z_SICK_THRESHOLD) return false;
  }
  return true;
}

// Sonno oggettivo (minuti) di un giorno specifico, dal record grezzo — MAI
// il sonno soggettivo del check-in (scala 1-5, grandezza diversa, vedi
// ADDENDUM-health-fase0.md: non si fondono).
function sleepMinutesForDate(recoveryRecords, dateKey) {
  const rec = recoveryRecords.find((r) => r?.date === dateKey);
  const min = rec?.sleep?.totalMin;
  return Number.isFinite(min) ? min : null;
}

// Media del sonno oggettivo sugli ultimi `days` giorni da `anchorKey`.
// Richiede un valore per OGNI giorno della finestra (stesso principio della
// Regola 1: un buco nella finestra rende la media inaffidabile, non si
// scatta la regola invece di calcolare una media parziale silenziosa).
function meanSleepHours(recoveryRecords, anchorKey, days) {
  const minutes = [];
  for (let i = 0; i < days; i++) {
    const key = shiftDateKey(anchorKey, -i);
    const m = sleepMinutesForDate(recoveryRecords, key);
    if (m === null) return null;
    minutes.push(m);
  }
  return minutes.reduce((a, b) => a + b, 0) / minutes.length / 60;
}

// Sessione di sparring: impact.roundsSparring > 0, o type/kind "sparring"
// (case-insensitive). Il campo impact.roundsSparring non esiste ancora
// nello storico reale (verificato in Fase 0) — la condizione semplicemente
// non matcha mai finché non esisterà, senza errori (optional chaining).
function isSparringSession(session) {
  const rounds = Number(session?.impact?.roundsSparring);
  if (Number.isFinite(rounds) && rounds > 0) return true;
  const type = String(session?.type || session?.kind || "").toLowerCase();
  return type === "sparring";
}

// C'è stata una sessione di sparring nelle ultime SPARRING_LOOKBACK_HOURS
// ore prima della fine di `anchorKey` (23:59:59 locale di quel giorno).
function hadRecentSparring(sessions, anchorKey) {
  if (!Array.isArray(sessions) || !anchorKey) return false;
  const anchorEndMs = new Date(`${anchorKey}T23:59:59`).getTime();
  const windowStartMs = anchorEndMs - SPARRING_LOOKBACK_HOURS * 3600 * 1000;
  return sessions.some((s) => {
    if (!isSparringSession(s)) return false;
    const ts = Date.parse(s?.date || s?.createdAt || "");
    return Number.isFinite(ts) && ts >= windowStartMs && ts <= anchorEndMs;
  });
}

// Taglio peso aggressivo: calo (non aumento) superiore a
// WEIGHT_CUT_PCT_PER_WEEK del peso corporeo attuale in 7 giorni. null/false
// se il peso non è disponibile (nessun dato — non si presume nulla).
function isAggressiveWeightCut(baseline) {
  const current = baseline?.bodyWeight?.current;
  const delta7d = baseline?.bodyWeight?.delta7d;
  if (!Number.isFinite(current) || current <= 0 || !Number.isFinite(delta7d)) return false;
  if (delta7d >= 0) return false; // aumento o stabile, non un taglio
  return Math.abs(delta7d) / current > WEIGHT_CUT_PCT_PER_WEEK;
}

function noChange() {
  return { volumePct: 0, intensityPct: 0 };
}

// ─────────────────────────────────────────────────────────
// Motore
// ─────────────────────────────────────────────────────────

/**
 * @param {object} p
 * @param {object} p.trainingLoad     - output di computeTrainingLoad (trainingLoad.js)
 * @param {object} p.readiness        - output di computeReadiness (athleteProfile.js)
 * @param {object} p.baseline         - output di computeRecoveryBaseline (recoveryBaseline.js)
 * @param {object|null} [p.checkIn]   - check-in odierno { fatigue:1-5, sleep:1-5, soreness } | null.
 *   NON nella firma del brief originale — aggiunto, vedi commento in testa al file.
 * @param {Array} [p.recoveryRecords] - storico giornaliero grezzo (regole multi-giorno)
 * @param {Array} [p.sessions]        - storico sessioni (sparring, in futuro carico d'impatto)
 * @param {object} p.phase            - output di computePeriodization (athleteProfile.js)
 * @param {object|null} [p.srpe]      - OPZIONALE, non ancora disponibile. Nessuna regola lo
 *   usa oggi: la firma lo accetta da subito, resta inerte se assente.
 * @returns {{
 *   level: "progress"|"maintain"|"reduce"|"rest"|"learning",
 *   headline: string,           // chiave i18n
 *   reasons: {code:string, severity:"info"|"warning"|"critical", detail:object|null}[],
 *   suggestedChange: {volumePct:number, intensityPct:number}|null,
 *   confidence: "none"|"low"|"medium"|"high",
 *   flags: string[],
 * }}
 */
export function computeLoadDecision({
  trainingLoad,
  readiness,
  baseline,
  checkIn = null,
  recoveryRecords = [],
  sessions = [],
  phase,
  srpe = null, // eslint-disable-line no-unused-vars -- non ancora usato da alcuna regola, vedi JSDoc
} = {}) {
  const records = Array.isArray(recoveryRecords) ? recoveryRecords : [];
  const sess = Array.isArray(sessions) ? sessions : [];
  const confidence = baseline?.confidence || "none";
  const flags = [];

  // ── GATE — confidence bassa: il motore non prescrive ──────────────────
  // "none" o "low" (o baseline del tutto assente): nessuna delle 10 regole
  // viene valutata. Un consiglio sbagliato dato con sicurezza nelle prime
  // due settimane distrugge la fiducia una volta sola — meglio dichiarare
  // apertamente che il sistema sta imparando.
  if (confidence === "none" || confidence === "low") {
    // "Giorni mancanti" = quanto manca alla metrica con MENO campioni tra
    // quelle che ne hanno almeno uno (stessa regola di
    // recoveryBaseline.js per la confidence globale: una metrica mai
    // scritta dalla fonte, es. HRV assente da Polar Flow, non abbassa la
    // stima solo perché è a zero) per raggiungere la soglia "medium" — la
    // prima da cui in poi le regole di progressione (9) possono scattare.
    const activeCounts = ["hrv", "restingHr", "sleep", "bodyWeight"]
      .map((k) => baseline?.[k]?.sampleCount)
      .filter((n) => Number.isFinite(n) && n > 0);
    const minActiveCount = activeCounts.length ? Math.min(...activeCounts) : 0;
    const daysUntilMedium = Math.max(0, CONFIDENCE_MEDIUM_SAMPLE_THRESHOLD - minActiveCount);

    return {
      level: "learning",
      headline: HEADLINE.learning,
      reasons: [{ code: "insufficient_baseline_data", severity: "info", detail: { daysUntilMedium } }],
      suggestedChange: null,
      confidence,
      flags,
    };
  }

  // Da qui in poi confidence è "medium" o "high" — la Regola 9 non ha
  // bisogno di un controllo esplicito sulla confidence, è già garantito
  // da questo gate.

  const seriesMap = buildLocalDateKeyedSeries(trainingLoad);
  const anchorKey = resolveAnchorDateKey(seriesMap, records);
  const acwr = computeAcwr(trainingLoad);
  const tsb = Number(trainingLoad?.current?.tsb);
  const tsbFinite = Number.isFinite(tsb) ? tsb : null;

  if (Number(trainingLoad?.current?.ctl) === 0 && Number(trainingLoad?.current?.atl) === 0) {
    flags.push("insufficient_data");
  }

  // Pavimento assoluto del sonno (vedi commento esteso sopra
  // SLEEP_ABSOLUTE_FLOOR_HOURS) — flag trasversale, valutato sempre,
  // indipendentemente da quale regola della cascata finisca per
  // determinare il livello (stesso trattamento di insufficient_data sopra
  // e del taglio peso più sotto).
  if (anchorKey) {
    const meanH3 = meanSleepHours(records, anchorKey, SLEEP_CHRONIC_DAYS);
    if (meanH3 !== null && meanH3 < SLEEP_ABSOLUTE_FLOOR_HOURS) {
      flags.push("chronic_severe_sleep_deficit");
    }
  }

  let result = null;

  // ── Regola 1 — pattern possibile malattia (LA PIÙ IMPORTANTE) ─────────
  if (
    anchorKey &&
    hrvDepressedForConsecutiveDays(records, baseline, anchorKey, HRV_SICK_CONSECUTIVE_DAYS) &&
    Number.isFinite(baseline?.restingHr?.deltaToday) &&
    Number.isFinite(baseline?.restingHr?.ewma) &&
    baseline.restingHr.ewma > 0 &&
    baseline.restingHr.deltaToday / baseline.restingHr.ewma > RESTING_HR_SICK_PCT
  ) {
    flags.push("possible_illness");
    result = {
      level: "rest",
      headline: HEADLINE.restIllness,
      reasons: [{
        code: "hrv_depressed_resting_hr_elevated",
        severity: "critical",
        // Segnala un PATTERN, mai una diagnosi (vedi brief): il testo che
        // Fase 2/3 costruiranno da questo codice deve invitare a
        // considerare uno stato di malessere e, se persiste, un medico —
        // mai affermare una condizione clinica.
        detail: { consecutiveDays: HRV_SICK_CONSECUTIVE_DAYS },
      }],
      suggestedChange: null, // "rest": una percentuale di volume/intensità non ha senso
      confidence,
      flags,
    };
  }

  // ── Regola 2 — crollo acuto ────────────────────────────────────────────
  if (!result && anchorKey) {
    const zToday = Number(baseline?.hrv?.zToday);
    const sleepH = sleepMinutesForDate(records, anchorKey);
    const sleepHours = sleepH !== null ? sleepH / 60 : null;
    const fatigue = Number(checkIn?.fatigue);
    if (
      Number.isFinite(zToday) && zToday < HRV_Z_ACUTE_THRESHOLD &&
      sleepHours !== null && sleepHours < SLEEP_ACUTE_HOURS &&
      Number.isFinite(fatigue) && fatigue >= FATIGUE_ACUTE_MIN
    ) {
      result = {
        level: "rest",
        headline: HEADLINE.restAcute,
        reasons: [{ code: "acute_hrv_sleep_fatigue_crash", severity: "critical", detail: null }],
        suggestedChange: null,
        confidence,
        flags,
      };
    }
  }

  // ── Regola 3 — taper pre-gara ───────────────────────────────────────────
  // weeksToMatch, non la stringa `phase.phase` (fragile, testo leggibile —
  // vedi Fase 0). Il motore non ridichiara le percentuali del brief
  // (-45%/-7%): usa i valori volume/intensity già restituiti da
  // computePeriodization, unica fonte di verità. Sono testo descrittivo
  // ("molto ridotto", "alta ma breve"), non percentuali — suggestedChange
  // resta null di proposito, il testo va nel detail del reason.
  if (!result && Number.isFinite(phase?.weeksToMatch) && phase.weeksToMatch === 1) {
    result = {
      level: "reduce",
      headline: HEADLINE.taper,
      reasons: [{
        code: "taper_active",
        severity: "warning",
        detail: { phase: phase.phase, volume: phase.volume, intensity: phase.intensity, focus: phase.focus },
      }],
      suggestedChange: null,
      confidence,
      flags,
    };
  }

  // ── Regola 4 — ACWR elevato, a EVENTO (vedi commento esteso sopra
  // ACWR_HIGH_THRESHOLD) ─────────────────────────────────────────────────
  if (!result && acwr !== null && acwr > ACWR_HIGH_THRESHOLD) {
    const yesterdayKey = anchorKey ? shiftDateKey(anchorKey, -1) : null;
    const yesterdayAcwr = yesterdayKey ? acwrForSeriesEntry(seriesMap.get(yesterdayKey)) : null;
    const wasAboveYesterday = yesterdayAcwr !== null && yesterdayAcwr > ACWR_HIGH_THRESHOLD;
    const acwrRounded = Math.round(acwr * 100) / 100;
    const yesterdayAcwrRounded = yesterdayAcwr !== null ? Math.round(yesterdayAcwr * 100) / 100 : null;

    if (!wasAboveYesterday) {
      // Ieri sotto soglia (o sconosciuto — trattato come "non sopra",
      // scelta prudente: meglio segnalare un possibile primo superamento
      // che perderlo per mancanza di storico). Il superamento è l'evento.
      result = {
        level: "reduce",
        headline: HEADLINE.acwrHigh,
        reasons: [{ code: "acwr_elevated", severity: "warning", detail: { acwr: acwrRounded, yesterdayAcwr: yesterdayAcwrRounded } }],
        suggestedChange: { volumePct: -25, intensityPct: null },
        confidence,
        flags,
      };
    } else if (acwr < yesterdayAcwr) {
      // Resta sopra soglia ma in discesa: l'atleta sta già correggendo,
      // non c'è un evento nuovo da segnalare. La regola non scatta —
      // si passa alla successiva della cascata.
    } else {
      // Resta sopra soglia e in salita (o piatto, >=): non un
      // superamento, un peggioramento continuato — stesso livello e
      // stessa azione consigliata di acwr_elevated, ma un reason
      // distinto perché il significato è diverso.
      result = {
        level: "reduce",
        headline: HEADLINE.acwrHigh,
        reasons: [{ code: "acwr_still_rising", severity: "warning", detail: { acwr: acwrRounded, yesterdayAcwr: yesterdayAcwrRounded } }],
        suggestedChange: { volumePct: -25, intensityPct: null },
        confidence,
        flags,
      };
    }
  }

  // ── Regola 5 — TSB molto negativo ────────────────────────────────────
  if (!result && tsbFinite !== null && tsbFinite < TSB_LOW_THRESHOLD) {
    result = {
      level: "reduce",
      headline: HEADLINE.tsbLow,
      reasons: [{ code: "tsb_very_low", severity: "warning", detail: { tsb: Math.round(tsbFinite) } }],
      suggestedChange: { volumePct: -20, intensityPct: null },
      confidence,
      flags,
    };
  }

  // ── Regola 6 — sparring recente ──────────────────────────────────────
  if (!result && hadRecentSparring(sess, anchorKey)) {
    flags.push("no_maximal_neural");
    result = {
      level: "maintain",
      headline: HEADLINE.sparring,
      reasons: [{ code: "recent_sparring", severity: "warning", detail: { lookbackHours: SPARRING_LOOKBACK_HOURS } }],
      suggestedChange: noChange(),
      confidence,
      flags,
    };
  }

  // ── Regola 7 — trend HRV in calo + TSB in debito moderato ────────────
  if (!result && baseline?.hrv?.trend === "down" && tsbFinite !== null && tsbFinite < TSB_MILD_LOW_THRESHOLD) {
    result = {
      level: "maintain",
      headline: HEADLINE.hrvTrendLowTsb,
      reasons: [{ code: "hrv_trend_down_tsb_low", severity: "info", detail: null }],
      suggestedChange: noChange(),
      confidence,
      flags,
    };
  }

  // ── Regola 8 — sonno sotto la baseline PERSONALE (vedi commento esteso
  // sopra SLEEP_RELATIVE_DEFICIT_PCT) ────────────────────────────────────
  if (!result && anchorKey) {
    const meanH = meanSleepHours(records, anchorKey, SLEEP_CHRONIC_DAYS);
    const baselineHours = Number.isFinite(baseline?.sleep?.meanTotalMin) ? baseline.sleep.meanTotalMin / 60 : null;
    if (meanH !== null && baselineHours !== null && meanH < baselineHours * (1 - SLEEP_RELATIVE_DEFICIT_PCT)) {
      result = {
        level: "maintain",
        headline: HEADLINE.sleepDeficit,
        reasons: [{
          code: "sleep_below_personal_baseline",
          severity: "info",
          detail: {
            days: SLEEP_CHRONIC_DAYS,
            meanHours: Math.round(meanH * 10) / 10,
            baselineHours: Math.round(baselineHours * 10) / 10,
          },
        }],
        suggestedChange: noChange(),
        confidence,
        flags,
      };
    }
  }

  // ── Regola 9 — finestra di progressione, RELATIVA (vedi commento esteso
  // sopra TSB_IMPROVEMENT_MIN_POINTS) ────────────────────────────────────
  if (!result && anchorKey) {
    const ctl = Number(trainingLoad?.current?.ctl);
    if (Number.isFinite(ctl) && ctl < CTL_BUILDING_BASE_THRESHOLD) {
      // Pavimento CTL (vedi commento esteso sopra CTL_BUILDING_BASE_THRESHOLD):
      // sotto una base cronica minima "progress" non ha senso concettuale —
      // non c'è nulla su cui progredire. Prende il posto dell'intera
      // valutazione di progressione, non solo del suo esito: sotto soglia
      // non si guardano nemmeno TSB/HRV/ACWR.
      //
      // Messaggio (Fase 2): deve comunicare un OBIETTIVO, non un deficit —
      // "continua con regolarità (es. 3 sedute a settimana per 3 settimane)",
      // mai una formulazione tipo "carico insufficiente" o "manca base".
      // Vincolo esplicito, non solo una preferenza stilistica.
      result = {
        level: "maintain",
        headline: HEADLINE.buildingBase,
        reasons: [{
          code: "building_base",
          severity: "info",
          detail: { ctl: Math.round(ctl * 10) / 10, threshold: CTL_BUILDING_BASE_THRESHOLD },
        }],
        suggestedChange: noChange(),
        confidence,
        flags,
      };
    } else {
      const meanTsbPrev = meanTsbPreviousDays(seriesMap, anchorKey, TSB_IMPROVEMENT_LOOKBACK_DAYS);
      const tsbImproving = tsbFinite !== null && meanTsbPrev !== null && (tsbFinite - meanTsbPrev) >= TSB_IMPROVEMENT_MIN_POINTS;
      const hrvOk = Number.isFinite(baseline?.hrv?.zToday) && baseline.hrv.zToday > HRV_Z_PROGRESS_MIN;
      const acwrOk = acwr !== null && acwr < ACWR_PROGRESS_MAX;

      if (tsbImproving && hrvOk && acwrOk) {
        result = {
          level: "progress",
          headline: HEADLINE.progress,
          reasons: [{
            code: "progression_window",
            severity: "info",
            detail: { tsbToday: Math.round(tsbFinite), meanTsbPrev3d: Math.round(meanTsbPrev) },
          }],
          suggestedChange: { volumePct: PROGRESS_VOLUME_PCT, intensityPct: null },
          confidence,
          flags,
        };
      }
    }
  }

  // ── Regola 10 — nessuna delle precedenti ─────────────────────────────
  if (!result) {
    result = {
      level: "maintain",
      headline: HEADLINE.maintainDefault,
      reasons: [{ code: "default_maintain", severity: "info", detail: null }],
      suggestedChange: noChange(),
      confidence,
      flags,
    };
  }

  // ── Vincolo di sicurezza trasversale — taglio peso aggressivo ────────
  // Si valuta SEMPRE (non solo quando il livello è "progress"): il flag è
  // un'informazione clinicamente rilevante indipendentemente dall'esito
  // scelto dalla cascata sopra.
  if (isAggressiveWeightCut(baseline)) {
    if (!result.flags.includes("aggressive_weight_cut")) result.flags = [...result.flags, "aggressive_weight_cut"];
    if (result.level === "progress") {
      result = {
        ...result,
        level: "maintain",
        headline: HEADLINE.maintainDefault,
        reasons: [
          ...result.reasons,
          { code: "aggressive_weight_cut_blocks_progress", severity: "warning", detail: null },
        ],
        suggestedChange: noChange(),
      };
    }
  }

  return result;
}
