// HRmax stimato in base all'età (se non fornito)
export function estimateHRMax(age) {
  if (!age) return 190; // fallback generico
  return Math.round(208 - 0.7 * age);
}

// Zone di allenamento (5 zone standard)
export function getHeartRateZone(hr, hrMax) {
  if (!hr || !hrMax) return null;
  const perc = (hr / hrMax) * 100;
  if (perc < 60) return 1;
  if (perc < 70) return 2;
  if (perc < 80) return 3;
  if (perc < 90) return 4;
  return 5;
}

// Calorie stimate (MET costante per sport da combattimento)
export function estimateCalories(durationMinutes, weightKg = 75, met = 9) {
  // formula classica kcal ≈ MET * peso(kg) * 0.0175 * minuti
  return met * weightKg * 0.0175 * durationMinutes;
}

// VO2max stimato da HRrest e HRmax (molto indicativo)
export function estimateVO2Max(hrRest, hrMax) {
  if (!hrRest || !hrMax) return null;
  return Number((15.3 * (hrMax / hrRest)).toFixed(1));
}
