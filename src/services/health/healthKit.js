// src/services/health/healthKit.js
//
// Implementazione iOS del provider salute, basata su
// @kingstinct/react-native-healthkit — NON ANCORA INSTALLATA (vedi FASE 1
// del brief: dipendenza da proporre, non installare senza conferma). Il
// require è lazy: finché il pacchetto non è nel progetto, getSdk() ritorna
// false e ogni funzione qui sotto si comporta esattamente come noop.js
// (isAvailable() -> false, letture -> array vuoto), senza mai lanciare.
//
// ⚠️ NON VERIFICATA A RUNTIME. In questo ambiente di sviluppo (Windows,
// solo build/dispositivo Android) non è disponibile un Mac/Xcode per
// testare il percorso iOS. I nomi di funzione/parametri dell'SDK sotto
// sono la forma plausibile del pacchetto alla data di stesura: vanno
// riverificati contro la documentazione reale quando verrà installato.
// La logica di normalizzazione (buildDailyRecoveryRecords) è invece
// condivisa con healthConnect.js e non dipende da questo SDK.
//
// SOLO SOLA LETTURA, SOLO i quattro tipi in scope. Nessun permesso Workout.

import { buildDailyRecoveryRecords } from "./recoveryAggregate";

const HK_TYPES = {
  hrv: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
  restingHr: "HKQuantityTypeIdentifierRestingHeartRate",
  sleep: "HKCategoryTypeIdentifierSleepAnalysis",
  weight: "HKQuantityTypeIdentifierBodyMass",
};
const READ_PERMISSIONS = Object.values(HK_TYPES);

let _sdk; // undefined = non ancora tentato, false = non disponibile, altrimenti il modulo
function getSdk() {
  if (_sdk !== undefined) return _sdk;
  try {
    _sdk = require("@kingstinct/react-native-healthkit");
  } catch {
    _sdk = false;
  }
  return _sdk;
}

export async function isAvailable() {
  const sdk = getSdk();
  if (!sdk) return false;
  try {
    return !!(await sdk.isHealthDataAvailable?.());
  } catch {
    return false;
  }
}

export async function getGrantedPermissions() {
  const sdk = getSdk();
  if (!sdk) return [];
  try {
    const granted = [];
    for (const type of READ_PERMISSIONS) {
      try {
        const status = await sdk.authorizationStatusFor?.(type);
        // 2 = sharingAuthorized nell'enum HealthKit (da riverificare col pacchetto reale)
        if (status === 2 || status === "sharingAuthorized") granted.push(type);
      } catch {}
    }
    return granted;
  } catch {
    return [];
  }
}

export async function requestPermissions() {
  const sdk = getSdk();
  if (!sdk) return false;
  try {
    // Sola lettura: nessun tipo in scrittura richiesto (primo array vuoto).
    await sdk.requestAuthorization?.([], READ_PERMISSIONS);
    return true;
  } catch {
    return false;
  }
}

// HealthKit non ha un equivalente diretto, verificato, del permesso
// storico di Health Connect (30gg senza permesso esplicito): non essendo
// questo SDK verificato a runtime, non si inventa qui un comportamento
// plausibile. Stub sicuro, coerente con noop.js — nessun accesso storico
// esteso finché il percorso iOS non sarà verificato su dispositivo reale.
export async function requestHistoryPermission() {
  return false;
}

export async function readRecoveryData(fromDate, toDate) {
  const sdk = getSdk();
  if (!sdk) return [];
  try {
    const range = { from: fromDate, to: toDate };
    const [hrvRaw, restingHrRaw, sleepRaw, weightRaw] = await Promise.all([
      (sdk.queryQuantitySamples?.(HK_TYPES.hrv, range) ?? Promise.resolve([])).catch(() => []),
      (sdk.queryQuantitySamples?.(HK_TYPES.restingHr, range) ?? Promise.resolve([])).catch(() => []),
      (sdk.queryCategorySamples?.(HK_TYPES.sleep, range) ?? Promise.resolve([])).catch(() => []),
      (sdk.queryQuantitySamples?.(HK_TYPES.weight, range) ?? Promise.resolve([])).catch(() => []),
    ]);

    const hrvSamples = (hrvRaw || []).map((s) => ({
      measuredAt: s.startDate || s.endDate,
      value: s.quantity ?? s.value,
      metric: "sdnn", // HealthKit espone sempre SDNN per questo tipo, mai rMSSD
    }));
    const restingHrSamples = (restingHrRaw || []).map((s) => ({
      measuredAt: s.startDate || s.endDate,
      value: s.quantity ?? s.value,
    }));
    // "asleep" copre le sotto-categorie core/deep/rem: non le distinguiamo
    // (vedi nota nel brief — l'accuratezza delle fasi da PPG è modesta).
    const sleepSessions = (sleepRaw || [])
      .filter((s) => {
        const v = String(s.value ?? s.sleepState ?? "").toLowerCase();
        return v.includes("asleep");
      })
      .map((s) => ({ startedAt: s.startDate, endedAt: s.endDate }));
    const weightSamples = (weightRaw || []).map((s) => ({
      measuredAt: s.startDate || s.endDate,
      value: s.quantity ?? s.value, // atteso in kg
    }));

    return buildDailyRecoveryRecords({
      hrvSamples,
      restingHrSamples,
      sleepSessions,
      weightSamples,
      source: "healthkit",
    });
  } catch {
    return [];
  }
}
