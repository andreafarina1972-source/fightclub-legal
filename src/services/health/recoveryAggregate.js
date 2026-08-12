// src/services/health/recoveryAggregate.js
//
// Logica di aggregazione condivisa tra healthKit.js e healthConnect.js:
// attribuzione delle notti di sonno al giorno del RISVEGLIO, fusione delle
// sessioni di sonno frammentate/sovrapposte, scarto dei sonnellini diurni,
// selezione del campione HRV affidabile (finestra al risveglio) — MA NON
// per FC a riposo, che segue una regola diversa (attribuzione al giorno del
// record, ultimo vince — vedi sezione dedicata, corretta il 12/08/2026: in
// Health Connect è un aggregato giornaliero scritto dalla sorgente a un
// orario arbitrario, non un campione da cercare vicino al risveglio) — e
// assemblaggio del record giornaliero normalizzato (vedi shape in
// healthProvider.js). Pure JS, nessuna dipendenza nativa: la stessa logica
// vale su entrambe le piattaforme — cambia solo la forma dei campioni
// grezzi in ingresso, che healthKit.js/healthConnect.js normalizzano
// PRIMA di passarli qui (measuredAt/value/metric, startedAt/endedAt).

import { localDateKey, localDateKeyAtOffset } from "../dateKey";

// Considera "notturna" una sessione di sonno il cui inizio cade nella fascia
// 18:00-12:00 (copre qualunque orario ragionevole di addormentamento nei
// diversi fusi/abitudini). Tutto il resto — es. un pisolino isolato nel
// primo pomeriggio — viene scartato: non entra mai nel calcolo del sonno
// notturno né, quindi, in nessuna decisione sul carico.
function isNightSession(session) {
  const hour = new Date(session.startedAt).getHours();
  return hour >= 18 || hour < 12;
}

// Fonde sessioni di sonno che si sovrappongono o sono separate da una pausa
// breve (<=30 min: risveglio notturno, non un nuovo sonno), in un'unica
// sessione con inizio/fine estesi. awakenings conta le fusioni (n sessioni
// fuse -> n-1 risvegli) — usato solo come fallback quando le sessioni non
// portano stages (vedi computeSleepMetricsFromStages più sotto). stages e
// gli offset di fuso vengono fusi/propagati insieme al resto.
export function mergeOverlappingSleepSessions(sessions) {
  if (!Array.isArray(sessions) || sessions.length === 0) return [];
  const sorted = [...sessions]
    .filter((s) => s?.startedAt && s?.endedAt)
    .sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));

  const GAP_MS = 30 * 60 * 1000;
  const merged = [];
  for (const s of sorted) {
    const startMs = new Date(s.startedAt).getTime();
    const endMs = new Date(s.endedAt).getTime();
    if (endMs <= startMs) continue; // sessione degenere, scartata

    const last = merged[merged.length - 1];
    if (last && startMs - new Date(last.endedAt).getTime() <= GAP_MS) {
      if (endMs > new Date(last.endedAt).getTime()) {
        last.endedAt = s.endedAt;
        last.endZoneOffsetSeconds = s.endZoneOffsetSeconds; // il risveglio ora è quello di questa sessione
      }
      last.awakenings += 1;
      last.inBedMs += endMs - startMs;
      if (Array.isArray(s.stages) && s.stages.length) last.stages.push(...s.stages);
    } else {
      merged.push({
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        startZoneOffsetSeconds: s.startZoneOffsetSeconds,
        endZoneOffsetSeconds: s.endZoneOffsetSeconds,
        awakenings: 0,
        inBedMs: endMs - startMs,
        stages: Array.isArray(s.stages) ? [...s.stages] : [],
      });
    }
  }
  return merged;
}

// La notte va attribuita al giorno del RISVEGLIO (endedAt) — mai al giorno
// di inizio: chi dorme dalle 23:14 alle 06:46 dell'11 agosto ha il record
// datato 11 agosto, non 10. Usa il fuso REGISTRATO SUL CAMPIONE
// (endZoneOffsetSeconds, il fuso reale al momento del risveglio) quando
// disponibile, non il fuso del dispositivo che legge il dato: un atleta
// che dorme fuori fuso e sincronizza dopo essere rientrato deve vedere la
// notte attribuita al giorno percepito sul posto. Fallback sul fuso
// locale del dispositivo per sorgenti che non forniscono l'offset
// (es. HealthKit, non ancora verificato a runtime).
export function nightToWakeDayKey(session) {
  if (Number.isFinite(session.endZoneOffsetSeconds)) {
    return localDateKeyAtOffset(session.endedAt, session.endZoneOffsetSeconds);
  }
  return localDateKey(new Date(session.endedAt));
}

// ─────────────────────────────────────────────────────────
// SONNO — metriche dai sotto-stadi (stages), quando disponibili
// ─────────────────────────────────────────────────────────
//
// Codici stage standard Android (Health Connect SleepSessionRecord.Stage).
// Non tutte le fonti li forniscono: se la sessione non ha stages,
// buildDailyRecoveryRecords ricade sul calcolo basato sulla sola durata
// (comportamento precedente a questa correzione).
const SLEEP_STAGE = { UNKNOWN: 0, AWAKE: 1, SLEEPING: 2, OUT_OF_BED: 3, LIGHT: 4, DEEP: 5, REM: 6 };
// Sonno effettivo: SLEEPING (generico) + LIGHT + DEEP + REM. Deliberatamente
// NON si distingue tra LIGHT/DEEP/REM in output: l'accuratezza di questa
// ripartizione da PPG è modesta e varia molto per dispositivo. Gli stage
// servono solo a separare in modo affidabile sonno da veglia, non a
// classificare le fasi del sonno.
const SLEEP_TYPE_STAGES = new Set([SLEEP_STAGE.SLEEPING, SLEEP_STAGE.LIGHT, SLEEP_STAGE.DEEP, SLEEP_STAGE.REM]);

// Un risveglio "vero" dura almeno 5 minuti: sotto questa soglia sono
// microrisvegli/arousal fisiologici normali (anche una decina a notte in
// un sonno del tutto sano) — contarli tutti renderebbe la metrica
// inutile in pratica (verificato su un caso reale: 13 segmenti AWAKE,
// nessuno >= 5 minuti, quindi 0 risvegli "veri" quella notte).
const AWAKENING_MIN_DURATION_MS = 5 * 60 * 1000;

// Ritorna null se la sessione non ha stages utilizzabili: il chiamante
// ricade allora sul calcolo basato sulla sola durata di sessione.
function computeSleepMetricsFromStages(session) {
  if (!Array.isArray(session.stages) || session.stages.length === 0) return null;

  let totalMin = 0; // sonno effettivo: somma dei segmenti SLEEPING/LIGHT/DEEP/REM
  let outOfBedMin = 0;
  let awakenings = 0;
  for (const stg of session.stages) {
    if (!stg?.startedAt || !stg?.endedAt) continue;
    const durMs = new Date(stg.endedAt).getTime() - new Date(stg.startedAt).getTime();
    if (durMs <= 0) continue;
    if (SLEEP_TYPE_STAGES.has(stg.stage)) totalMin += durMs / 60000;
    else if (stg.stage === SLEEP_STAGE.OUT_OF_BED) outOfBedMin += durMs / 60000;
    else if (stg.stage === SLEEP_STAGE.AWAKE && durMs >= AWAKENING_MIN_DURATION_MS) awakenings += 1;
    // UNKNOWN e AWAKE sotto soglia: non contano né come sonno né come fuori
    // dal letto, restano semplicemente esclusi da totalMin (un buco nella
    // copertura degli stage non viene mai assunto come sonno).
  }

  const sessionMin = (new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 60000;
  const inBedMin = Math.round(Math.max(0, sessionMin - outOfBedMin));
  const totalMinRounded = Math.round(totalMin);

  return {
    totalMin: totalMinRounded,
    inBedMin,
    efficiency: inBedMin > 0 ? Math.round((totalMinRounded / inBedMin) * 1000) / 1000 : null,
    awakenings,
  };
}

// ─────────────────────────────────────────────────────────
// HRV — selezione per prossimità al risveglio, non "ultimo vince"
// ─────────────────────────────────────────────────────────
//
// SOLO HRV: FC a riposo NON passa più da qui (vedi sezione dedicata più
// sotto, corretta il 12/08/2026 — era concettualmente sbagliato
// applicarle la stessa logica, vedi commento lì).
//
// L'HRV è interpretabile solo se misurato al risveglio a riposo: un
// campione delle 18:00 non è confrontabile con quello delle 7:00,
// mescolarli produce baseline rumorose (su iOS il campionamento SDNN è
// sporadico durante il giorno, quindi il rischio è concreto). Regola:
//   - se il giorno ha una sessione di sonno nota, prende il campione più
//     vicino al risveglio, entro 2 ore dal risveglio (prima o dopo: un
//     campione notturno terminato pochi minuti prima del risveglio conta
//     quanto uno preso subito dopo essersi alzati)
//   - altrimenti, finestra fissa 04:00-11:00 locali dello stesso giorno,
//     primo campione cronologico nella finestra
//   - nessun campione in finestra -> il campo resta null. Meglio un buco
//     che un valore inaffidabile: recoveryBaseline.js conta i campioni via
//     sampleCount e gestisce la confidence di conseguenza.
const WAKE_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 ore, prima o dopo il risveglio
const FIXED_WINDOW_START_HOUR = 4;
const FIXED_WINDOW_END_HOUR = 11;

function pickWakeWindowSample(samples, dateKey, wakeAt) {
  if (wakeAt) {
    const wakeMs = new Date(wakeAt).getTime();
    let best = null;
    let bestDist = Infinity;
    for (const s of samples) {
      if (!Number.isFinite(s?.value) || !s?.measuredAt) continue;
      const dist = Math.abs(new Date(s.measuredAt).getTime() - wakeMs);
      if (dist <= WAKE_WINDOW_MS && dist < bestDist) {
        best = s;
        bestDist = dist;
      }
    }
    return best;
  }

  // Fallback: nessuna sessione di sonno nota per questo giorno -> finestra
  // fissa locale, primo campione cronologico al suo interno.
  let best = null;
  for (const s of samples) {
    if (!Number.isFinite(s?.value) || !s?.measuredAt) continue;
    const d = new Date(s.measuredAt);
    if (localDateKey(d) !== dateKey) continue;
    const hour = d.getHours();
    if (hour < FIXED_WINDOW_START_HOUR || hour >= FIXED_WINDOW_END_HOUR) continue;
    if (!best || d < new Date(best.measuredAt)) best = s;
  }
  return best;
}

// ─────────────────────────────────────────────────────────
// FC A RIPOSO — aggregato giornaliero, non selezione per risveglio
// ─────────────────────────────────────────────────────────
//
// Corretto il 12/08/2026: un primo tentativo passava anche FC a riposo da
// pickWakeWindowSample sopra, stessa logica di HRV. Sbagliato — in Health
// Connect (verificato sul dispositivo reale) FC a riposo è un AGGREGATO
// GIORNALIERO calcolato dalla sorgente, non un campione puntuale misurato
// al risveglio: il timestamp sul record è l'ora di SCRITTURA del valore,
// non di misurazione (Zepp scrive alle 21:59 locali). Cercarlo "vicino al
// risveglio" non ha senso concettuale, e nella pratica scartava quasi
// tutti i valori (4 su 31gg invece di uno al giorno).
//
// Regola: attribuzione al giorno LOCALE del record stesso, "ultimo vince"
// in caso di più scritture nello stesso giorno — la stessa regola già
// usata per il peso corporeo più sotto, per lo stesso motivo: è un
// valore stabile/aggregato da leggere così com'è, non un segnale da
// campionare nella finestra giusta.
//
// Scarta i record con timestamp degenere (anteriore all'anno 2000):
// placeholder di sorgenti che non datano il valore (osservato: epoch
// 1970 da Polar). Attribuirli al loro giorno letterale (1/1/1970)
// creerebbe un bucket-data isolato, mai raggiunto dalle finestre di
// 90/28gg su cui operano recoveryStorage.js/recoveryBaseline.js — puro
// rumore da scartare qui, alla fonte.
const DEGENERATE_TIMESTAMP_CUTOFF_MS = Date.UTC(2000, 0, 1);

/**
 * Assembla i record di recupero giornalieri per l'intervallo richiesto, a
 * partire dai campioni già normalizzati per piattaforma.
 *
 * @param {object} p
 * @param {{measuredAt:string, value:number, metric:"sdnn"|"rmssd"}[]} p.hrvSamples
 * @param {{measuredAt:string, value:number}[]} p.restingHrSamples  aggregato
 *   giornaliero, non campione — "ultimo vince" per giorno locale del
 *   record, timestamp anteriori al 2000 scartati (vedi sopra).
 * @param {{startedAt:string, endedAt:string, totalMin?:number,
 *   startZoneOffsetSeconds?:number, endZoneOffsetSeconds?:number,
 *   stages?:{stage:number, startedAt:string, endedAt:string}[]}[]} p.sleepSessions
 *   grezze: possono includere sonnellini diurni e sessioni sovrapposte,
 *   vengono filtrate/fuse qui. Se stages è presente (verificato contro un
 *   payload reale Health Connect), le metriche di sonno vengono calcolate
 *   dai sotto-stadi (vedi computeSleepMetricsFromStages); altrimenti si
 *   ricade sulla durata di sessione, come prima di questa correzione.
 *   endZoneOffsetSeconds, se presente, determina l'attribuzione al giorno
 *   di risveglio (vedi nightToWakeDayKey) invece del fuso del dispositivo.
 * @param {{measuredAt:string, value:number}[]} p.weightSamples  kg — qui SÌ
 *   "ultimo campione vince": il peso è stabile, il valore più recente è il migliore.
 * @param {"healthkit"|"healthconnect"} p.source
 * @returns {Array} DailyRecovery[] — vedi shape in healthProvider.js
 */
export function buildDailyRecoveryRecords({
  hrvSamples = [],
  restingHrSamples = [],
  sleepSessions = [],
  weightSamples = [],
  source,
}) {
  const byDate = new Map();
  function ensure(dateKey) {
    if (!byDate.has(dateKey)) {
      byDate.set(dateKey, { date: dateKey, hrv: null, restingHr: null, sleep: null, bodyWeight: null, source });
    }
    return byDate.get(dateKey);
  }

  // 1) Sonno per primo: scarta i pisolini diurni, fonde le sessioni notturne
  // frammentate, attribuisce al giorno del risveglio. Serve prima di HRV,
  // la cui finestra di selezione è ancorata al risveglio — NON serve più a
  // FC a riposo, che ora attribuisce al giorno del proprio timestamp di
  // scrittura (vedi sezione dedicata sopra).
  const nightSessions = (sleepSessions || []).filter((s) => s?.startedAt && s?.endedAt && isNightSession(s));
  const mergedSleep = mergeOverlappingSleepSessions(nightSessions);
  const wakeAtByDate = new Map();
  for (const s of mergedSleep) {
    const key = nightToWakeDayKey(s);
    wakeAtByDate.set(key, s.endedAt);
    const rec = ensure(key);

    // Se la sessione porta stages, le metriche vengono dai sotto-stadi
    // (sonno effettivo, awakenings reali >= 5min). Altrimenti fallback sul
    // calcolo basato sulla sola durata — comportamento precedente,
    // invariato per le fonti che non forniscono stages.
    const stageMetrics = computeSleepMetricsFromStages(s);
    let totalMin, inBedMin, efficiency, awakenings;
    if (stageMetrics) {
      ({ totalMin, inBedMin, efficiency, awakenings } = stageMetrics);
    } else {
      inBedMin = Math.round(s.inBedMs / 60000);
      totalMin = Number.isFinite(s.totalMin) ? s.totalMin : inBedMin;
      efficiency = inBedMin > 0 ? Math.round((totalMin / inBedMin) * 1000) / 1000 : null;
      awakenings = s.awakenings;
    }

    rec.sleep = {
      totalMin,
      inBedMin,
      efficiency,
      awakenings,
      startedAt: s.startedAt,
      // Fuso al momento del risveglio, conservato nel record (non solo
      // usato per l'attribuzione della data) — null se la fonte non lo
      // fornisce (vedi nightToWakeDayKey).
      endZoneOffsetSeconds: Number.isFinite(s.endZoneOffsetSeconds) ? s.endZoneOffsetSeconds : null,
    };
  }

  // 2) HRV: un giorno candidato è ogni data con sonno noto, più ogni data
  // derivata dal giorno locale "naive" dei campioni stessi (copre il caso
  // senza sonno, dove serve comunque sapere quali giorni controllare per
  // la finestra fissa 04:00-11:00). FC a riposo non contribuisce più a
  // questo insieme (vedi passo 2b sotto): non ha bisogno del giorno di
  // risveglio per essere attribuita.
  const candidateDates = new Set(wakeAtByDate.keys());
  for (const s of hrvSamples) if (s?.measuredAt) candidateDates.add(localDateKey(new Date(s.measuredAt)));

  for (const dateKey of candidateDates) {
    const wakeAt = wakeAtByDate.get(dateKey) || null;
    // ensure() SEMPRE, non solo quando si trova un campione valido: un
    // giorno candidato senza campione HRV affidabile deve comunque
    // comparire con hrv esplicitamente null, non sparire dall'output.
    const rec = ensure(dateKey);

    const hrvPick = pickWakeWindowSample(hrvSamples, dateKey, wakeAt);
    if (hrvPick) rec.hrv = { value: hrvPick.value, metric: hrvPick.metric };
  }

  // 2b) FC a riposo: aggregato giornaliero, non selezione per risveglio
  // (vedi sezione dedicata sopra). Attribuzione al giorno LOCALE del
  // timestamp di scrittura del record, "ultimo vince" — stessa forma del
  // passo 3 (peso) subito sotto, per lo stesso motivo. I record con
  // timestamp anteriore all'anno 2000 (placeholder di sorgenti che non
  // datano il valore, es. epoch 1970 da Polar) sono scartati qui, prima
  // di entrare in qualunque bucket-data.
  for (const s of restingHrSamples) {
    if (!Number.isFinite(s?.value) || !s?.measuredAt) continue;
    const measuredMs = new Date(s.measuredAt).getTime();
    if (!Number.isFinite(measuredMs) || measuredMs < DEGENERATE_TIMESTAMP_CUTOFF_MS) continue;
    const key = localDateKey(new Date(s.measuredAt));
    const rec = ensure(key);
    if (rec.restingHr == null || measuredMs >= (rec._restingHrAt ?? -Infinity)) {
      rec.restingHr = s.value;
      rec._restingHrAt = measuredMs;
    }
  }

  // 3) Peso corporeo: stabile, "ultimo campione del giorno vince".
  for (const s of weightSamples) {
    if (!Number.isFinite(s?.value) || !s?.measuredAt) continue;
    const key = localDateKey(new Date(s.measuredAt));
    const rec = ensure(key);
    if (rec.bodyWeight == null || new Date(s.measuredAt) >= new Date(rec._weightAt || 0)) {
      rec.bodyWeight = s.value;
      rec._weightAt = s.measuredAt;
    }
  }

  // Rimuove i campi interni di supporto prima di restituire, e ordina per
  // data crescente.
  return Array.from(byDate.values())
    .map(({ _weightAt, _restingHrAt, ...clean }) => clean)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
