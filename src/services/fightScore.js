// src/services/fightScore.js
//
// Fight Score — indice 0-100 che combina:
//   • Zona HR       (0-40 pt) — intensità cardiovascolare
//   • Cadenza colpi (0-40 pt) — volume e ritmo offensivo
//   • Costanza      (0-20 pt) — equilibrio tra le due componenti
//
// Usabile in tempo reale (aggiornato ogni secondo durante il round).
// Non richiede dipendenze extra — logica pura.

// ─────────────────────────────────────────────────────────
// COSTANTI DI CONFIGURAZIONE
// ─────────────────────────────────────────────────────────

// Soglie cadenza (pugni/min) → punteggio
// Basate su Hetzler et al. (boxing intensity research) e pratica comune:
//   principiante <15 ppm, amatore 15-35, fighter 35-55, elite 55+
const PACE_THRESHOLDS = [
  { minPpm: 0,  maxPpm: 5,  score: 2  },
  { minPpm: 5,  maxPpm: 10, score: 8  },
  { minPpm: 10, maxPpm: 20, score: 16 },
  { minPpm: 20, maxPpm: 30, score: 24 },
  { minPpm: 30, maxPpm: 45, score: 32 },
  { minPpm: 45, maxPpm: 60, score: 38 },
  { minPpm: 60, maxPpm: Infinity, score: 40 },
];

// Soglie zona HR (%HRmax) → punteggio
// Z4-Z5 danno il massimo: un fighter deve lavorare sopra soglia
const HR_ZONE_SCORES = {
  z1: 5,   // <60%: riscaldamento
  z2: 15,  // 60-70%: aerobico leggero
  z3: 25,  // 70-80%: aerobico soglia
  z4: 35,  // 80-90%: soglia lattacida
  z5: 40,  // >90%: massimale
};

// ─────────────────────────────────────────────────────────
// FUNZIONE PRINCIPALE
// ─────────────────────────────────────────────────────────

/**
 * Calcola il Fight Score corrente.
 *
 * @param {object} params
 *   hrBpm           - HR attuale in bpm (null se non connessa)
 *   hrMax           - HRmax atleta (dalla Settings, es. 187)
 *   punchesInRound  - colpi contati dall'inizio del round corrente
 *   elapsedInRound  - secondi trascorsi nel round corrente (> 0)
 *
 * @returns {object}
 *   total     - punteggio 0-100
 *   hrScore   - componente HR (0-40)
 *   paceScore - componente cadenza (0-40)
 *   constancyScore - componente costanza (0-20)
 *   hrZone    - zona HR 1-5 (o null)
 *   ppm       - pugni al minuto correnti
 *   label     - etichetta testuale del livello
 */
export function calcFightScore({ hrBpm, hrMax, punchesInRound, elapsedInRound }) {
  // ── Componente HR ──────────────────────────────────────
  let hrScore = 0;
  let hrZone  = null;

  if (hrBpm != null && Number.isFinite(hrBpm) &&
      hrMax != null && Number.isFinite(hrMax) && hrMax > 0) {
    const p = hrBpm / hrMax;
    if      (p >= 0.90) { hrZone = 5; hrScore = HR_ZONE_SCORES.z5; }
    else if (p >= 0.80) { hrZone = 4; hrScore = HR_ZONE_SCORES.z4; }
    else if (p >= 0.70) { hrZone = 3; hrScore = HR_ZONE_SCORES.z3; }
    else if (p >= 0.60) { hrZone = 2; hrScore = HR_ZONE_SCORES.z2; }
    else if (p >= 0.50) { hrZone = 1; hrScore = HR_ZONE_SCORES.z1; }
  }

  // ── Componente cadenza ─────────────────────────────────
  let paceScore = 0;
  let ppm       = 0;

  const elapsed = Number(elapsedInRound) || 0;
  const punches = Number(punchesInRound) || 0;

  if (punches > 0 && elapsed > 3) {
    ppm = (punches / elapsed) * 60;
    for (const band of PACE_THRESHOLDS) {
      if (ppm >= band.minPpm && ppm < band.maxPpm) {
        paceScore = band.score;
        break;
      }
    }
  }

  // ── Componente costanza ────────────────────────────────
  // Media geometrica normalizzata: premia chi ha sia HR che cadenza attive.
  // Se manca la HR (no cardiofrequenzimetro), la costanza è sempre 0 —
  // questo incentiva l'uso della fascia cardio.
  let constancyScore = 0;
  if (hrScore > 0 && paceScore > 0) {
    const hrNorm   = hrScore   / 40;
    const paceNorm = paceScore / 40;
    constancyScore = Math.round(20 * Math.sqrt(hrNorm * paceNorm));
  }

  const total = Math.min(100, Math.round(hrScore + paceScore + constancyScore));

  return {
    total,
    hrScore,
    paceScore,
    constancyScore,
    hrZone,
    ppm: Math.round(ppm),
    label: scoreLabel(total),
  };
}

// ─────────────────────────────────────────────────────────
// ETICHETTA TESTUALE
// ─────────────────────────────────────────────────────────

export function scoreLabel(score) {
  if (score >= 90) return "ELITE";
  if (score >= 75) return "FIGHTER";
  if (score >= 55) return "ACTIVE";
  if (score >= 35) return "WARM UP";
  return "IDLE";
}

// Colore dell'etichetta in base al punteggio
export function scoreColor(score) {
  if (score >= 90) return "#FF4D6D"; // rosso fuoco — massimale
  if (score >= 75) return "#FF9500"; // arancio — zona combattimento
  if (score >= 55) return "#37E293"; // verde — zona allenamento
  if (score >= 35) return "#2D9CDB"; // blu — riscaldamento
  return "#555";                     // grigio — idle
}

// ─────────────────────────────────────────────────────────
// HOOK: useFightScore
// ─────────────────────────────────────────────────────────
// Calcola il Fight Score in tempo reale dato lo stato del timer.
// Aggiornato ogni volta che cambiano hr, punchCount o seconds.

import { useMemo } from "react";

/**
 * @param {object} params
 *   phase          - fase corrente del timer ("round", "rest", ecc.)
 *   hrBpm          - HR attuale
 *   hrMax          - HRmax atleta
 *   punchCount     - colpi totali sessione
 *   punchesByRound - array colpi per round completati
 *   roundSeconds   - durata configurata del round (secondi)
 *   seconds        - secondi rimanenti nel round corrente
 */
export function useFightScore({ phase, hrBpm, hrMax, punchCount, punchesByRound, roundSeconds, seconds }) {
  return useMemo(() => {
    const isRound = String(phase || "").toLowerCase() === "round";

    // Fuori dal round: score 0
    if (!isRound) {
      return { total: 0, hrScore: 0, paceScore: 0, constancyScore: 0, hrZone: null, ppm: 0, label: "IDLE" };
    }

    // Colpi nel round corrente = totale - somma round precedenti
    const prevPunches = Array.isArray(punchesByRound)
      ? punchesByRound.reduce((a, b) => a + (Number(b) || 0), 0)
      : 0;
    const punchesInRound = Math.max(0, (Number(punchCount) || 0) - prevPunches);

    // Secondi trascorsi nel round corrente
    const elapsedInRound = Math.max(1, (Number(roundSeconds) || 180) - (Number(seconds) || 0));

    return calcFightScore({
      hrBpm,
      hrMax: Number(hrMax) || 190,
      punchesInRound,
      elapsedInRound,
    });
  }, [phase, hrBpm, hrMax, punchCount, punchesByRound, roundSeconds, seconds]);
}