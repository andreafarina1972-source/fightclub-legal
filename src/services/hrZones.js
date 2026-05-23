// src/services/hrZones.js
import AsyncStorage from "@react-native-async-storage/async-storage";

// ==========================
// PROFILO ATLETA (età / HRmax)
// ==========================
const AGE_KEY = "athleteAge";
const HRMAX_KEY = "hrMax"; // opzionale: se lo imposti manualmente

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export async function getAthleteAge() {
  try {
    const raw = await AsyncStorage.getItem(AGE_KEY);
    const v = Number(raw);
    if (Number.isFinite(v) && v >= 5 && v <= 100) return Math.round(v);
  } catch {}
  return null;
}

export async function setAthleteAge(age) {
  const v = Math.round(Number(age));
  if (!Number.isFinite(v)) return;
  const safe = clamp(v, 5, 100);
  await AsyncStorage.setItem(AGE_KEY, String(safe));
}

export function estimateHrMaxFromAge(age) {
  const a = Number(age);
  if (!Number.isFinite(a)) return 190;
  // Tanaka: 208 - 0.7*età
  return Math.round(208 - 0.7 * clamp(a, 5, 100));
}

// Fallback: 1) hrMax manuale, 2) stima da età, 3) default
export async function getHrMax() {
  try {
    const raw = await AsyncStorage.getItem(HRMAX_KEY);
    const v = Number(raw);
    if (Number.isFinite(v) && v >= 120 && v <= 240) return Math.round(v);
  } catch {}

  const age = await getAthleteAge();
  if (age != null) return estimateHrMaxFromAge(age);

  return 190;
}

/**
 * Zone metaboliche (%HRmax) - ACSM 2022 / Billat 2001 / Wassermann:
 *
 *  Cardio (aerobico leggero):         60-75%  HRmax  - sotto VT1, ossidazione lipidica
 *  Aerobico soglia (aer. lattacido):  75-87%  HRmax  - tra VT1 e VT2, lattato stabile
 *  Anaerobico lattacido:              87-95%  HRmax  - sopra VT2, accumulo lattato
 *  Anaerobico alattacido (sprint):    95-100% HRmax  - filiera fosfocreatinica
 *
 * FIX float: p arrotondato a 4 decimali (es. 59.89% -> 60.00% con bpm=112, hrMax=187).
 * Fonti: ACSM Guidelines 10a ed. 2022; Billat VL, Sports Med 2001;
 *        Wassermann K. et al., Principles of Exercise Testing 2012.
 */
export function metabolicZoneFromBpm(bpm, hrMax) {
  if (!Number.isFinite(bpm) || bpm <= 0) return null;
  const max = Number(hrMax);
  if (!Number.isFinite(max) || max <= 0) return null;

  // Arrotondamento a 4 decimali per robustezza floating-point IEEE 754
  const p = Math.round((bpm / max) * 10000) / 10000;

  if (p < 0.60) return null;
  if (p < 0.75) return "cardio";
  if (p < 0.87) return "aer_latt";   // FIX: era 0.85, ACSM/Billat VT2 ~ 87%
  if (p < 0.95) return "an_latt";    // FIX: era 0.92, an. lattacido fino a ~95%
  return "an_alatt";                  // FIX: era 0.92, alattacido puro > 95%
}

/**
 * Zone di allenamento Z1-Z5 (%HRmax) - standard ACSM / Polar / Garmin / British Cycling:
 *
 *  Z1 Recupero attivo:   50-60%  HRmax
 *  Z2 Aerobico base:     60-70%  HRmax
 *  Z3 Aerobico soglia:   70-80%  HRmax
 *  Z4 Soglia lattacida:  80-90%  HRmax
 *  Z5 VO2max/massimale:  90-100% HRmax
 *
 * FIX float: p arrotondato a 4 decimali per robustezza IEEE 754.
 * Fonti: ACSM Guidelines 10a ed. 2022; Polar Zone Calculator;
 *        Garmin Training Zones; British Cycling Training Plans.
 */
export function trainingZoneFromBpm(bpm, hrMax) {
  if (!Number.isFinite(bpm) || bpm <= 0) return null;
  const max = Number(hrMax);
  if (!Number.isFinite(max) || max <= 0) return null;

  // Arrotondamento a 4 decimali per robustezza floating-point IEEE 754
  const p = Math.round((bpm / max) * 10000) / 10000;

  if (p < 0.50) return null; // sotto Z1: recupero passivo, non conteggiato
  if (p < 0.60) return "z1";
  if (p < 0.70) return "z2";
  if (p < 0.80) return "z3";
  if (p < 0.90) return "z4";
  return "z5";
}

/**
 * computeZoneSeconds(samples, hrMax, kind)
 * samples: [{ bpm }] campionati ~1Hz
 * kind: "metabolic" | "training"
 */
export function computeZoneSeconds(samples, hrMax, kind = "metabolic") {
  const secs =
    kind === "training"
      ? { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 }
      : { cardio: 0, aer_latt: 0, an_latt: 0, an_alatt: 0 };

  for (const s of samples || []) {
    const bpm = s?.bpm;
    const z =
      kind === "training"
        ? trainingZoneFromBpm(bpm, hrMax)
        : metabolicZoneFromBpm(bpm, hrMax);
    if (z) secs[z] += 1;
  }

  const total = Object.values(secs).reduce((a, b) => a + b, 0);
  return { secs, total };
}

export function zonesMeta(secs) {
  const safe = secs || { cardio: 0, aer_latt: 0, an_latt: 0, an_alatt: 0 };
  return [
    { key: "cardio", labelKey: "zones.metabolic.cardio", label: "Cardio", seconds: safe.cardio || 0, color: "#37E293" },
    { key: "aer_latt", labelKey: "zones.metabolic.aerobicLactic", label: "Aerobico lattacido", seconds: safe.aer_latt || 0, color: "#7DDCFF" },
    { key: "an_latt", labelKey: "zones.metabolic.anaerobicLactic", label: "Anaerobico lattacido", seconds: safe.an_latt || 0, color: "#FFB020" },
    { key: "an_alatt", labelKey: "zones.metabolic.anaerobicAlactic", label: "Anaerobico alattacido", seconds: safe.an_alatt || 0, color: "#FF4D4D" },
  ];
}

export function trainingZonesMeta(secs) {
  const safe = secs || { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
  return [
    { key: "z5", labelKey: "zones.training.z5", label: "Z5", seconds: safe.z5 || 0, color: "#FF4D4D" },
    { key: "z4", labelKey: "zones.training.z4", label: "Z4", seconds: safe.z4 || 0, color: "#FFB020" },
    { key: "z3", labelKey: "zones.training.z3", label: "Z3", seconds: safe.z3 || 0, color: "#7DDCFF" },
    { key: "z2", labelKey: "zones.training.z2", label: "Z2", seconds: safe.z2 || 0, color: "#37E293" },
    { key: "z1", labelKey: "zones.training.z1", label: "Z1", seconds: safe.z1 || 0, color: "#9AA0A6" },
  ];
}

/**
 * Helper per conteggio live 1Hz:
 * elapsed: secondi totali trascorsi (anche senza bpm)
 * metabolic/training: secondi per zona (solo quando bpm valido)
 */
export function initZonesAccumulator() {
  return {
    elapsed: 0,
    metabolic: { cardio: 0, aer_latt: 0, an_latt: 0, an_alatt: 0 },
    training: { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 },
  };
}

export function accumulateZones(acc, bpm, hrMax) {
  if (!acc) return;
  acc.elapsed += 1;

  const mz = metabolicZoneFromBpm(bpm, hrMax);
  if (mz) acc.metabolic[mz] += 1;

  const tz = trainingZoneFromBpm(bpm, hrMax);
  if (tz) acc.training[tz] += 1;
}
