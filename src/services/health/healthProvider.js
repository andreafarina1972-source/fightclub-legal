// src/services/health/healthProvider.js
//
// Unica porta d'accesso ai dati di recupero da HealthKit/Health Connect.
// Il resto dell'app deve importare SOLO questo file, mai healthKit.js /
// healthConnect.js / noop.js direttamente: non deve mai sapere da quale
// piattaforma arriva il dato.
//
// SOLA LETTURA. SOLO i quattro tipi in scope (HRV, FC a riposo, sonno,
// peso corporeo) — vedi BRIEF-health-integration.md. Nessun permesso o
// lettura di tipo Workout/ExerciseSession, nessuna scrittura verso le
// piattaforme salute.
//
// Questo passo implementa SOLO interfaccia e lettura: nessuna persistenza
// né sincronizzazione qui (arriva al passo successivo, che scriverà su
// fightclub_recovery_v1 usando readRecoveryData esposta qui).
//
// Ogni funzione è avvolta in try/catch: un errore imprevisto in una delle
// tre implementazioni non deve mai propagarsi come eccezione fino
// all'app — permessi negati o piattaforma non supportata equivalgono
// sempre a "nessun dato disponibile", mai a un crash.

import { Platform } from "react-native";

let _impl = null;
function getImpl() {
  if (_impl) return _impl;
  if (Platform.OS === "ios") _impl = require("./healthKit");
  else if (Platform.OS === "android") _impl = require("./healthConnect");
  else _impl = require("./noop");
  return _impl;
}

/**
 * Il servizio salute è disponibile su questo dispositivo? Verificato con
 * una query reale al servizio a runtime (mai dedotto dalla versione SDK
 * dichiarata: su Android, Health Connect esiste solo da API 28 anche se
 * l'app supporta minSdk 26 — vedi healthConnect.js).
 * @returns {Promise<boolean>}
 */
export async function isAvailable() {
  try {
    return await getImpl().isAvailable();
  } catch {
    return false;
  }
}

/** @returns {Promise<string[]>} tipi di dato per cui il permesso di lettura è già concesso */
export async function getGrantedPermissions() {
  try {
    return await getImpl().getGrantedPermissions();
  } catch {
    return [];
  }
}

/**
 * Richiede SOLO i quattro permessi core (HRV, FC a riposo, sonno, peso).
 * Il permesso storico (accesso a dati oltre i 30gg su Android) è separato,
 * vedi requestHistoryPermission() — non va richiesto insieme a questi.
 * @returns {Promise<boolean>} true se l'utente ha concesso almeno un permesso richiesto
 */
export async function requestPermissions() {
  try {
    return await getImpl().requestPermissions();
  } catch {
    return false;
  }
}

/**
 * Richiede il permesso opzionale per leggere dati più vecchi di 30gg
 * (Android Health Connect: READ_HEALTH_DATA_HISTORY). Non fa parte dei
 * quattro permessi core, va invocato a parte su azione esplicita
 * dell'utente (pensato per un opt-in nella UI del passo 8). Su iOS/altre
 * piattaforme non ha equivalente verificato: torna sempre false.
 * @returns {Promise<boolean>} true se concesso
 */
export async function requestHistoryPermission() {
  try {
    return await getImpl().requestHistoryPermission();
  } catch {
    return false;
  }
}

/**
 * Legge i dati di recupero nell'intervallo [fromDate, toDate], normalizzati
 * in un record per giorno (chiave locale, non UTC — vedi services/dateKey.js).
 * Senza il permesso storico (vedi requestHistoryPermission), la finestra
 * effettivamente letta viene troncata ai 30gg più recenti invece di
 * fallire o restituire un risultato vuoto per l'intero intervallo.
 *
 * @param {Date} fromDate
 * @param {Date} toDate
 * @returns {Promise<Array<{
 *   date: string,                                            // "YYYY-MM-DD", locale
 *   hrv: {value:number, metric:"sdnn"|"rmssd"} | null,
 *   restingHr: number | null,                                 // bpm
 *   sleep: {
 *     totalMin: number,                                       // sonno effettivo (da stages se disponibili)
 *     inBedMin: number,
 *     efficiency: number | null,                              // totalMin / inBedMin
 *     awakenings: number,                                     // segmenti AWAKE >= 5min (da stages), o fallback su fusione sessioni
 *     startedAt: string,                                      // ISO
 *     endZoneOffsetSeconds: number | null,                    // fuso al risveglio, se la fonte lo fornisce
 *   } | null,
 *   bodyWeight: number | null,                                // kg
 *   source: "healthkit" | "healthconnect",
 * }>>} array vuoto se non disponibile, permessi negati, o errore — mai un'eccezione
 */
export async function readRecoveryData(fromDate, toDate) {
  try {
    return await getImpl().readRecoveryData(fromDate, toDate);
  } catch {
    return [];
  }
}
