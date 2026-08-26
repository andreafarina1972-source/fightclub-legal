// src/services/vo2Utils.js
// FIX: allineato a hrZones.js e metrics.js
// Fonti scientifiche:
//   - HRmax: Tanaka et al. 2001 (ACSM raccomandato, errore ±7 bpm vs 220-age ±15 bpm)
//   - VO2max: Uth N. et al. 2004 (European Journal of Applied Physiology)
//             validata su popolazioni miste, ottimale per uso con cardiofrequenzimetro

// ------------------------------------------------------------------
// HRmax — formula Tanaka (identica a hrZones.js e metrics.js)
// 220 - age era obsoleta (Karvonen 1957) con errore ±15 bpm
// ------------------------------------------------------------------
export function estimateHrMax(age = 35) {
  const a = Math.max(5, Math.min(100, Number(age) || 35));
  return Math.round(208 - 0.7 * a);
}

// ------------------------------------------------------------------
// Zone cardio (5 zone standard su %HRmax)
// ------------------------------------------------------------------
export function getHrZones(age = 35) {
  const hrMax = estimateHrMax(age);
  return {
    z1: [0.50 * hrMax, 0.60 * hrMax],
    z2: [0.60 * hrMax, 0.70 * hrMax],
    z3: [0.70 * hrMax, 0.80 * hrMax],
    z4: [0.80 * hrMax, 0.90 * hrMax],
    z5: [0.90 * hrMax, 1.00 * hrMax],
  };
}

// Percentuale minima di HRmax richiesta durante il test perché la misurazione sia
// considerata attendibile. La letteratura sui test HR-based (es. protocolli submassimali
// ACSM) richiede tipicamente uno sforzo che porti la FC ad almeno l'85% della FC massima:
// sotto quella soglia l'estrapolazione della capacità aerobica diventa troppo imprecisa.
const VO2_TEST_MIN_HR_RATIO = 0.85;

/** FC minima (bpm) che il test deve raggiungere per essere considerato valido. */
export function getVo2TestMinHr(age = 35) {
  return Math.round(VO2_TEST_MIN_HR_RATIO * estimateHrMax(age));
}

// ------------------------------------------------------------------
// VO2max — formula Uth et al. 2004
//   VO2max = 15.3 × (HRmax / HRrest)
//
// Parametri:
//   avgHr   : frequenza cardiaca media rilevata durante il test (bpm)
//   age     : età in anni (per calcolare HRmax con Tanaka)
//   hrRest  : frequenza cardiaca a riposo (bpm); default 60 se non nota
//
// La formula Uth usa HRmax e HRrest — non la HR media di esercizio.
// Per un test submassimale da app (HR media su 30s in esercizio aerobico)
// usiamo HRmax stimato da Tanaka + HRrest, che è l'uso validato.
// ------------------------------------------------------------------

// Range fisiologico plausibile per un VO2max umano (BRIEF-vo2max-verifica.md,
// Intervento B): decondizionato/sedentario verso il limite basso, atleti di
// resistenza d'élite verso il limite alto. La formula da sola non lo garantisce
// — età minima (5) e HRrest minima (30) ammesse altrove sono entrambe
// individualmente plausibili ma la LORO combinazione (15.3 × 204.5/30 ≈ 104)
// supera il limite umano: è un segnale di input scorretto, non un atleta reale.
const VO2_PHYSIOLOGICAL_MIN = 20;
const VO2_PHYSIOLOGICAL_MAX = 90;

export function estimateVo2Max(avgHr, age = 35, hrRest = 60) {
  const hrMax = estimateHrMax(age);
  const rest  = Math.max(30, Math.min(100, Number(hrRest) || 60));

  // Guardia: la FC media durante il test deve raggiungere almeno l'85% della FC
  // massima stimata (vedi getVo2TestMinHr) — sotto quella soglia la stima non è
  // scientificamente attendibile, indipendentemente dall'età dell'atleta.
  const minHr = getVo2TestMinHr(age);
  if (!avgHr || avgHr < minHr) return null;

  // Uth: 15.3 × (HRmax / HRrest)
  const vo2 = 15.3 * (hrMax / rest);
  const clamped = Math.max(VO2_PHYSIOLOGICAL_MIN, Math.min(VO2_PHYSIOLOGICAL_MAX, vo2));
  return Math.round(clamped * 10) / 10;
}

// ------------------------------------------------------------------
// Calorie stimate (formula MET — identica a metrics.js per coerenza)
// kcal = MET × peso(kg) × 0.0175 × durata(min)
// MET boxe/arti marziali: 9-10 (ACSM Compendium of Physical Activities)
// ------------------------------------------------------------------
export function estimateCaloriesFromSession(totalSeconds, avgHr = 0, weightKg = 75) {
  const durationMin = totalSeconds / 60;
  // MET dinamico basato su HR (se disponibile), altrimenti 9 (boxe steady)
  const met = (avgHr >= 100)
    ? Math.min(14, Math.max(6, 6 + (avgHr - 100) / 15))
    : 9;
  return Math.round(met * weightKg * 0.0175 * durationMin * 10) / 10;
}
