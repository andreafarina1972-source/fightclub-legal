// src/services/trainingLoad.js
//
// Training Load — CTL / ATL / TSB
//
// Modello:
//   TSS  — Training Stress Score per sessione (0-300)
//   CTL  — Chronic Training Load  "Fitness"  τ=42gg → media mob. exp.
//   ATL  — Acute Training Load    "Fatica"   τ=7gg  → media mob. exp.
//   TSB  — Training Stress Balance "Forma"   = CTL - ATL
//
// Fonte: Banister 1991, Coggan 2003, stessa matematica di Garmin/TrainingPeaks.

// ─────────────────────────────────────────────────────────
// COSTANTI
// ─────────────────────────────────────────────────────────
const CTL_DAYS = 42;
const ATL_DAYS = 7;
const K_CTL = 1 - 1 / CTL_DAYS; // 0.97619
const K_ATL = 1 - 1 / ATL_DAYS; // 0.85714

// ─────────────────────────────────────────────────────────
// TSS PER SESSIONE
// ─────────────────────────────────────────────────────────

/**
 * Calcola il Training Stress Score di una singola sessione.
 *
 * Logica:
 *   TSS = durationMin × intensityFactor² × 1.5
 *
 * intensityFactor (0-1) combina:
 *   - HR media normalizzata su HRmax (peso principale)
 *   - Volume colpi (bonus fino a +25%)
 *   - Fight Score peak (bonus fino a +25%, solo se disponibile)
 *
 * Calibrazione: 1h in Z3 (avgHr ~75% HRmax) → TSS ≈ 55-65
 *               1h in Z4 (avgHr ~85% HRmax) → TSS ≈ 85-100
 */
export function sessionTSS(session) {
  if (!session || typeof session !== "object") return 0;

  // Durata in minuti — legge qualsiasi campo presente
  const durationMin =
    (Number(session.totalSeconds) > 0 ? session.totalSeconds / 60 : 0) ||
    (Number(session.elapsed) > 0 ? session.elapsed / 60 : 0) ||
    (Number(session.totalMinutes) > 0 ? session.totalMinutes : 0) ||
    (Number(session.durationSeconds) > 0 ? session.durationSeconds / 60 : 0);

  if (durationMin < 1) return 0;

  // Intensità HR
  const avgHr = Number(session.avgHr);
  const hrMax = Number(session.hrZones?.hrMax || session.zones?.hrMax) || 190;
  let hrIntensity = 0.50; // default Z3 se non c'è HR

  if (Number.isFinite(avgHr) && avgHr > 0 && hrMax > 0) {
    const p = avgHr / hrMax;
    if      (p >= 0.90) hrIntensity = 1.00;
    else if (p >= 0.80) hrIntensity = 0.85;
    else if (p >= 0.70) hrIntensity = 0.70;
    else if (p >= 0.60) hrIntensity = 0.55;
    else if (p >= 0.50) hrIntensity = 0.40;
    else                hrIntensity = 0.25;
  }

  // Bonus colpi (max +0.20)
  const punches = Number(session.punches) || 0;
  const punchBonus = Math.min(0.20, punches / 1000);

  // Bonus Fight Score (max +0.15, solo se presente)
  const fs = Number(session.fightScorePeak);
  const fsBonus = Number.isFinite(fs) && fs > 0 ? Math.min(0.15, fs / 667) : 0;

  const intensity = Math.min(1.0, hrIntensity + punchBonus + fsBonus);
  const tss = durationMin * intensity * intensity * 1.5;

  return Math.min(300, Math.round(tss));
}

// ─────────────────────────────────────────────────────────
// CALCOLO CTL / ATL / TSB SU TUTTO LO STORICO
// ─────────────────────────────────────────────────────────

/**
 * Dato l'array di sessioni dallo storico, restituisce:
 *   - serie giornaliera CTL/ATL/TSB per il grafico
 *   - valori correnti (oggi)
 *   - ultimo TSS, media settimanale
 *
 * @param {object[]} sessions  - array da HistoryContext
 * @param {number}   [days=90] - finestra temporale del grafico
 */
export function computeTrainingLoad(sessions, days = 90) {
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return { series: [], current: { ctl: 0, atl: 0, tsb: 0, tss: 0 }, weeklyTSS: 0, lastTSS: 0 };
  }

  // Mappa data ISO → TSS (somma se più sessioni lo stesso giorno)
  const tssMap = new Map();
  for (const s of sessions) {
    const raw = s.date || s.createdAt;
    if (!raw) continue;
    const dateKey = raw.slice(0, 10); // "YYYY-MM-DD"
    const tss = sessionTSS(s);
    tssMap.set(dateKey, (tssMap.get(dateKey) || 0) + tss);
  }

  // Data odierna e finestra temporale estesa (CTL ha τ=42gg, serve storia più lunga)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Partiamo dall'inizio della storia (max 180gg indietro per inizializzare CTL)
  const allDates = [...tssMap.keys()].sort();
  const firstDate = allDates.length > 0
    ? new Date(Math.min(new Date(allDates[0]).getTime(), today.getTime() - 180 * 86400000))
    : new Date(today.getTime() - 180 * 86400000);

  let ctl = 0;
  let atl = 0;
  const series = [];   // solo ultimi `days` giorni per il grafico
  const cutoff = new Date(today.getTime() - days * 86400000);

  // Itera giorno per giorno dall'inizio al oggi
  const cursor = new Date(firstDate);
  while (cursor <= today) {
    const key = cursor.toISOString().slice(0, 10);
    const tss = tssMap.get(key) || 0;

    // Aggiorna esponenziali
    ctl = ctl * K_CTL + tss * (1 - K_CTL);
    atl = atl * K_ATL + tss * (1 - K_ATL);

    // Aggiungi alla serie solo se dentro la finestra grafico
    if (cursor >= cutoff) {
      series.push({
        date: key,
        ctl:  parseFloat(ctl.toFixed(1)),
        atl:  parseFloat(atl.toFixed(1)),
        tsb:  parseFloat((ctl - atl).toFixed(1)),
        tss,
      });
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  // TSS ultima settimana (somma 7gg)
  const weekAgo = new Date(today.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  let weeklyTSS = 0;
  for (const [d, tss] of tssMap) {
    if (d >= weekAgo) weeklyTSS += tss;
  }

  // Ultimo TSS registrato
  const lastKey = allDates[allDates.length - 1];
  const lastTSS = lastKey ? (tssMap.get(lastKey) || 0) : 0;

  const current = series.length > 0
    ? series[series.length - 1]
    : { ctl: 0, atl: 0, tsb: 0, tss: 0 };

  return {
    series,
    current,
    weeklyTSS: Math.round(weeklyTSS),
    lastTSS,
  };
}

// ─────────────────────────────────────────────────────────
// INTERPRETAZIONE TSB (Forma)
// ─────────────────────────────────────────────────────────

/**
 * Restituisce un'interpretazione testuale del TSB corrente.
 * Soglie di riferimento: TrainingPeaks / Seiler 2010.
 *
 * TSB > +10  : forma ottimale (gara/match)
 * TSB  0..+10: fresco, pronto ad aumentare il carico
 * TSB -10..0 : accumulo controllato (normale in settimane di carico)
 * TSB -20..-10: affaticamento medio (monitorare)
 * TSB < -20  : sovrallenamento — serve recupero
 */
export function tsbStatus(tsb) {
  const v = Number(tsb);
  if (!Number.isFinite(v)) return { key: "unknown", color: "#555", label: "N/D" };
  if (v > 10)   return { key: "peak",     color: "#37E293", label: "Forma ottimale" };
  if (v >= 0)   return { key: "fresh",    color: "#2D9CDB", label: "Fresco" };
  if (v >= -10) return { key: "load",     color: "#FF9500", label: "Carico normale" };
  if (v >= -20) return { key: "fatigue",  color: "#FF4D6D", label: "Affaticamento" };
  return             { key: "overreach",  color: "#B00020", label: "Recupera!" };
}