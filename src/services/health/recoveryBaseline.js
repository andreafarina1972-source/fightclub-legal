// src/services/health/recoveryBaseline.js
//
// Passo 6: baseline di recupero calcolata al volo sui record già salvati
// in fightclub_recovery_v1 (recoveryStorage.js). Funzione pura, nessuna
// persistenza — stesso principio di computeTrainingLoad/computeReadiness:
// nessuno snapshot, si ricalcola ogni volta sui dati grezzi disponibili.
//
// Ancora temporale: la data più recente PRESENTE NEI RECORD passati, non
// new Date(). Rende la funzione deterministica e testabile senza dover
// congelare l'orologio di sistema — e comunque, chi chiama questa funzione
// passa lo storico già filtrato da recoveryStorage.js, quindi l'ultimo
// record disponibile è già "oggi" nella stragrande maggioranza dei casi
// (sync regolare).

// ─────────────────────────────────────────────────────────
// Helper puri
// ─────────────────────────────────────────────────────────

// Sposta una chiave data "YYYY-MM-DD" di N giorni, senza alcuna dipendenza
// dal fuso del dispositivo: ancorata a mezzogiorno UTC così un giorno
// intero di spostamento non può mai attraversare un cambio di data per
// arrotondamento. Usata solo per aritmetica su chiavi data, non per
// attribuire eventi a un giorno (quello è compito di dateKey.js).
function shiftDateKey(dateKey, deltaDays) {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

// Arrotonda e, soprattutto, blinda contro NaN/Infinity: qualunque calcolo
// che produca un valore non finito esce come null, mai propagato. Questo
// è il punto unico che garantisce il vincolo "nessun NaN in output".
function roundTo(value, decimals) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// Deviazione standard di POPOLAZIONE (divide per n, non n-1): con un solo
// campione la varianza campionaria dividerebbe per 0 (NaN); quella di
// popolazione dà correttamente 0 (nessuna dispersione misurabile su un
// solo punto), coerente col vincolo "mai NaN".
function populationStdDev(values, avg) {
  if (!values.length) return null;
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// EWMA con fattore di scorrimento standard alpha = 2/(span+1) (la stessa
// convenzione di pandas .ewm(span=N)) — non una media a finestra fissa:
// ogni campione pesa meno del precedente in modo esponenziale, non sparisce
// di colpo quando esce dalla finestra. Applicata SOLO ai giorni con un
// campione valido per quella metrica: i giorni senza dato non "diluiscono"
// né vengono interpolati, semplicemente non producono un passo.
function computeEwma(values, alpha) {
  if (!values.length) return null;
  let ewma = values[0];
  for (let i = 1; i < values.length; i++) ewma = alpha * values[i] + (1 - alpha) * ewma;
  return ewma;
}

// Trend: confronta la media della prima metà con quella della seconda metà
// della serie campionata (non calendariale: solo i giorni con dato).
// Soglia 3% di scarto relativo per "stable" — sotto, il rumore normale di
// misura non giustifica di segnalare una direzione. Richiede almeno 2
// campioni, altrimenti non c'è nulla da confrontare.
function computeTrend(values) {
  if (values.length < 2) return null;
  const mid = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, mid);
  const secondHalf = values.slice(mid);
  const m1 = mean(firstHalf);
  const m2 = mean(secondHalf);
  if (m1 === 0) return m2 === 0 ? "stable" : m2 > 0 ? "up" : "down";
  const relDiff = (m2 - m1) / Math.abs(m1);
  if (Math.abs(relDiff) < 0.03) return "stable";
  return relDiff > 0 ? "up" : "down";
}

// Il campione con data <= targetKey più vicino a targetKey, cercando in un
// array già ordinato per data crescente. Usato per i delta di peso: un
// utente non si pesa tutti i giorni, quindi "7 giorni fa" nella pratica
// significa "l'ultima pesata prima di 7 giorni fa".
function findClosestAtOrBefore(sortedByDate, targetKey) {
  let found = null;
  for (const r of sortedByDate) {
    if (r.date <= targetKey) found = r;
    else break;
  }
  return found;
}

// Metrica HRV maggioritaria nella finestra: se compaiono sia sdnn che
// rmssd (fonti diverse, es. cambio wearable), non si fondono — sono scale
// diverse e mescolarle produrrebbe una baseline priva di senso fisico. Si
// sceglie la metrica coi più campioni; in caso di pareggio esatto, quella
// dell'ultimo campione cronologico (la più rilevante ora). I campioni
// dell'altra metrica vengono scartati per intero, non solo ignorati nel
// calcolo del valore — anche il loro conteggio non entra in sampleCount.
function chooseMajorityHrvMetric(windowedRecords) {
  const counts = {};
  let lastMetric = null;
  let lastDate = null;
  for (const r of windowedRecords) {
    if (!r.hrv || !r.hrv.metric) continue;
    counts[r.hrv.metric] = (counts[r.hrv.metric] || 0) + 1;
    if (!lastDate || r.date > lastDate) {
      lastDate = r.date;
      lastMetric = r.hrv.metric;
    }
  }
  const metrics = Object.keys(counts);
  if (metrics.length === 0) return null;
  if (metrics.length === 1) return metrics[0];
  let best = metrics[0];
  for (const m of metrics) if (counts[m] > counts[best]) best = m;
  const tied = metrics.filter((m) => counts[m] === counts[best]);
  return tied.length > 1 ? lastMetric : best;
}

// Soglie di confidence per sampleCount, applicate PER METRICA (non un
// unico conteggio globale — vedi computeRecoveryBaseline).
function confidenceForSampleCount(n) {
  if (n >= 28) return "high";
  if (n >= 14) return "medium";
  if (n >= 7) return "low";
  return "none";
}
const CONFIDENCE_RANK = { none: 0, low: 1, medium: 2, high: 3 };

const EMPTY_RESULT = {
  hrv: { metric: null, ewma: null, sd: null, zToday: null, trend: null, sampleCount: 0 },
  restingHr: { ewma: null, deltaToday: null, sampleCount: 0 },
  sleep: { meanTotalMin: null, meanEfficiency: null, sampleCount: 0 },
  bodyWeight: { current: null, delta7d: null, delta28d: null, sampleCount: 0 },
  confidence: "none",
};

/**
 * Calcola la baseline di recupero sugli ultimi `days` giorni disponibili
 * nei record passati (tipicamente l'output di recoveryStorage.loadRecoveryRecords()).
 * Pura: nessuna I/O, nessuna dipendenza dall'orologio di sistema, stesso
 * input -> stesso output sempre.
 *
 * @param {Array<{date:string, hrv:{value:number,metric:string}|null,
 *   restingHr:number|null, sleep:{totalMin:number,efficiency:number|null}|null,
 *   bodyWeight:number|null}>} recoveryRecords
 * @param {number} [days=28] ampiezza della finestra (giorni calendariali,
 *   ancorata alla data più recente presente in recoveryRecords)
 * @returns {{
 *   hrv: {metric:string|null, ewma:number|null, sd:number|null, zToday:number|null, trend:"up"|"down"|"stable"|null, sampleCount:number},
 *   restingHr: {ewma:number|null, deltaToday:number|null, sampleCount:number},
 *   sleep: {meanTotalMin:number|null, meanEfficiency:number|null, sampleCount:number},
 *   bodyWeight: {current:number|null, delta7d:number|null, delta28d:number|null, sampleCount:number},
 *   confidence: "none"|"low"|"medium"|"high",
 * }}
 */
export function computeRecoveryBaseline(recoveryRecords, days = 28) {
  const records = Array.isArray(recoveryRecords) ? recoveryRecords.filter((r) => r?.date) : [];
  if (records.length === 0) return EMPTY_RESULT;

  const sorted = [...records].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const anchorKey = sorted[sorted.length - 1].date;
  // -days, non -(days-1): un campione esattamente a `days` giorni
  // dall'ancora deve restare dentro la finestra (serve a bodyWeight.delta28d
  // con days=28: la pesata di esattamente 28 giorni fa è il riferimento per
  // definizione, escluderla per un giorno di margine la renderebbe sempre
  // null). Stessa convenzione già usata da recoveryStorage.js/pruneToWindow.
  const cutoffKey = shiftDateKey(anchorKey, -days);
  const windowedRecords = sorted.filter((r) => r.date >= cutoffKey);

  const alpha = 2 / (days + 1);

  // ── HRV ──────────────────────────────────────────────────
  const chosenMetric = chooseMajorityHrvMetric(windowedRecords);
  let hrv;
  if (!chosenMetric) {
    hrv = { metric: null, ewma: null, sd: null, zToday: null, trend: null, sampleCount: 0 };
  } else {
    const values = windowedRecords
      .filter((r) => r.hrv?.metric === chosenMetric && Number.isFinite(r.hrv.value))
      .map((r) => r.hrv.value);
    if (values.length === 0) {
      hrv = { metric: chosenMetric, ewma: null, sd: null, zToday: null, trend: null, sampleCount: 0 };
    } else {
      const ewma = computeEwma(values, alpha);
      const avg = mean(values);
      const sd = populationStdDev(values, avg);
      const lastValue = values[values.length - 1];
      const zToday = sd > 0 ? roundTo((lastValue - ewma) / sd, 2) : 0;
      hrv = {
        metric: chosenMetric,
        ewma: roundTo(ewma, 1),
        sd: roundTo(sd, 1),
        zToday,
        trend: computeTrend(values),
        sampleCount: values.length,
      };
    }
  }

  // ── FC a riposo ──────────────────────────────────────────
  const rhrValues = windowedRecords.filter((r) => Number.isFinite(r.restingHr)).map((r) => r.restingHr);
  let restingHr;
  if (rhrValues.length === 0) {
    restingHr = { ewma: null, deltaToday: null, sampleCount: 0 };
  } else {
    const ewma = computeEwma(rhrValues, alpha);
    const lastValue = rhrValues[rhrValues.length - 1];
    restingHr = { ewma: roundTo(ewma, 1), deltaToday: roundTo(lastValue - ewma, 1), sampleCount: rhrValues.length };
  }

  // ── Sonno — media semplice, non EWMA (non richiesta per questa metrica) ──
  const sleepRecords = windowedRecords.filter((r) => r.sleep);
  let sleep;
  if (sleepRecords.length === 0) {
    sleep = { meanTotalMin: null, meanEfficiency: null, sampleCount: 0 };
  } else {
    const totalMins = sleepRecords.map((r) => r.sleep.totalMin).filter(Number.isFinite);
    const effs = sleepRecords.map((r) => r.sleep.efficiency).filter(Number.isFinite);
    sleep = {
      meanTotalMin: totalMins.length ? roundTo(mean(totalMins), 0) : null,
      meanEfficiency: effs.length ? roundTo(mean(effs), 3) : null,
      sampleCount: sleepRecords.length,
    };
  }

  // ── Peso corporeo ────────────────────────────────────────
  const weightRecords = windowedRecords
    .filter((r) => Number.isFinite(r.bodyWeight))
    .map((r) => ({ date: r.date, value: r.bodyWeight }));
  let bodyWeight;
  if (weightRecords.length === 0) {
    bodyWeight = { current: null, delta7d: null, delta28d: null, sampleCount: 0 };
  } else {
    const last = weightRecords[weightRecords.length - 1];
    const ref7 = findClosestAtOrBefore(weightRecords, shiftDateKey(last.date, -7));
    const ref28 = findClosestAtOrBefore(weightRecords, shiftDateKey(last.date, -28));
    bodyWeight = {
      current: roundTo(last.value, 1),
      delta7d: ref7 ? roundTo(last.value - ref7.value, 1) : null,
      delta28d: ref28 ? roundTo(last.value - ref28.value, 1) : null,
      sampleCount: weightRecords.length,
    };
  }

  // ── Confidence globale: minimo tra le metriche CON ALMENO UN CAMPIONE ──
  // (rule 3): ignorare le metriche a zero campioni evita che l'assenza di
  // una singola metrica (tipicamente HRV, mai scritta da Polar Flow)
  // blocchi la confidence globale a "none" anche quando sonno/peso/FC a
  // riposo hanno storico abbondante.
  const levels = [hrv, restingHr, sleep, bodyWeight]
    .filter((m) => m.sampleCount > 0)
    .map((m) => confidenceForSampleCount(m.sampleCount));
  const confidence = levels.length
    ? levels.reduce((min, l) => (CONFIDENCE_RANK[l] < CONFIDENCE_RANK[min] ? l : min))
    : "none";

  return { hrv, restingHr, sleep, bodyWeight, confidence };
}
