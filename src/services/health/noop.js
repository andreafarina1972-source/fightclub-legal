// src/services/health/noop.js
//
// Implementazione no-op del provider salute: usata su piattaforme non
// supportate (web, desktop). Non lancia mai eccezioni, non richiede alcuna
// dipendenza nativa. healthKit.js e healthConnect.js degradano allo stesso
// comportamento osservabile (isAvailable() -> false, letture -> array
// vuoto) quando il rispettivo pacchetto nativo non è installato o i
// permessi sono negati — vedi healthProvider.js.

export async function isAvailable() {
  return false;
}

export async function getGrantedPermissions() {
  return [];
}

export async function requestPermissions() {
  return false;
}

export async function requestHistoryPermission() {
  return false;
}

export async function readRecoveryData(_fromDate, _toDate) {
  return [];
}
