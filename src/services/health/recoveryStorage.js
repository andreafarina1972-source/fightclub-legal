// src/services/health/recoveryStorage.js
//
// Passo 5: persistenza + sync dei dati di recupero letti da healthProvider
// (vedi healthProvider.js). Chiave unica versionata, array, finestra
// mobile di 90 giorni, un record per data locale — come richiesto
// dall'addendum (non uno schema a chiave-per-mese).
//
// Nessuna baseline calcolata qui: questo file salva solo i record
// giornalieri grezzi (hrv/restingHr/sleep/bodyWeight per data). Le
// baseline restano funzioni pure calcolate al volo sui record caricati da
// qui (passo 6, recoveryBaseline.js) — mai persistite come snapshot,
// stesso principio già seguito da computeTrainingLoad/computeReadiness.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { localDateKey } from "../dateKey";
import * as healthProvider from "./healthProvider";

const RECOVERY_STORAGE_KEY = "fightclub_recovery_v1";
const RECOVERY_LAST_SYNC_KEY = "fightclub_recovery_last_sync_v1";

// Passo 8 — preferenza dell'utente, distinta dal permesso OS: Health
// Connect non permette a un'app di revocare da codice un permesso già
// concesso, quindi "scollega" nella UI non può davvero disconnettere a
// livello di sistema. Senza questo flag, il prossimo sync silenzioso
// (trigger 4h in App.js) rileverebbe il permesso OS ancora concesso e
// ripartirebbe da solo, vanificando lo scollegamento. syncRecoveryData()
// verifica questo flag PRIMA di leggere qualunque dato.
const HEALTH_ENABLED_KEY = "fightclub_health_integration_enabled";

export async function isHealthIntegrationEnabled() {
  try {
    return (await AsyncStorage.getItem(HEALTH_ENABLED_KEY)) === "true";
  } catch {
    return false;
  }
}

export async function setHealthIntegrationEnabled(enabled) {
  try {
    await AsyncStorage.setItem(HEALTH_ENABLED_KEY, enabled ? "true" : "false");
  } catch {
    // best-effort, come le altre scritture di stato in questo file
  }
}

// Finestra di conservazione: oltre i 90 giorni un record recovery non serve
// più a nessun calcolo (baseline EWMA e readiness guardano indietro al
// massimo ~28-60gg). Stesso valore usato per il buffer check-in (passo 3).
const RECOVERY_WINDOW_DAYS = 90;

// Ad ogni sync si ri-richiedono gli ultimi 14 giorni, non solo il giorno
// corrente: Health Connect/HealthKit possono ricevere campioni con
// ritardo (sync del wearable il giorno dopo, sonno corretto a posteriori,
// ecc.). 14gg copre ampiamente questi casi senza interrogare la piattaforma
// salute per l'intera finestra di 90gg ad ogni sync.
const SYNC_LOOKBACK_DAYS = 14;

// ─────────────────────────────────────────────────────────
// Pure — nessuna I/O, testabili in isolamento
// ─────────────────────────────────────────────────────────

// Scarta i record più vecchi della finestra mobile. Confronto per stringa
// "YYYY-MM-DD": lessicografico = cronologico per chiavi data locali di
// questo formato (stessa proprietà già sfruttata in recoveryAggregate.js).
export function pruneToWindow(records, windowDays = RECOVERY_WINDOW_DAYS, today = new Date()) {
  if (!Array.isArray(records)) return [];
  const cutoffKey = localDateKey(new Date(today.getTime() - windowDays * 86400000));
  return records.filter((r) => r?.date && r.date >= cutoffKey);
}

// I quattro campi dato dei record recovery, quelli su cui il merge opera
// campo per campo (non include `date`/`source`/`sources`, che sono
// metadati del record, non dati).
const RECOVERY_FIELDS = ["hrv", "restingHr", "sleep", "bodyWeight"];

// Provenienza di un campo: preferisce sources[campo] se presente
// (record già passato da un merge, o corretto a mano al passo 8);
// altrimenti ricade sul `source` di record intero (record letti prima di
// questa correzione, o mai passati da un merge — un solo provider ha
// popolato l'intero record, quindi il source di record è equivalente).
function fieldSource(record, field) {
  if (record?.sources && record.sources[field] != null) return record.sources[field];
  return record?.source ?? null;
}

// Normalizza un record "passthrough" (nessuna controparte per la sua data
// nell'altro array) in modo che porti sempre un `sources` completo: così
// ogni record persistito ha la stessa forma, indipendentemente da quante
// volte è già passato da un merge.
function withNormalizedSources(record) {
  const sources = {};
  for (const field of RECOVERY_FIELDS) sources[field] = fieldSource(record, field);
  return { ...record, sources };
}

// Unisce i record esistenti con quelli appena letti dal provider salute,
// CAMPO PER CAMPO — non a livello di record intero. Un campo che l'utente
// ha corretto a mano (sources[campo] === "manual", passo 8) vince sempre e
// non viene mai sovrascritto da un import successivo: è la regola
// dell'addendum, non negoziabile anche se oggi nessun percorso scrive
// ancora "manual" (il primo sync dopo un'eventuale correzione manuale
// futura non deve comunque cancellarla). Nota: la chiave "hrRest"
// esistente (SettingsScreen.js, usata per la stima VO2max) NON scrive
// qui — è un dato separato per decisione esplicita, vedi commento su
// HR_REST_KEY in SettingsScreen.js.
//
// Per ogni campo NON manuale, vince sempre `incoming` — compreso il caso
// in cui un valore prima presente torni null (vedi motivazione originale:
// è una ricomputazione fresca dai campioni grezzi più recenti, quindi per
// definizione la lettura più affidabile disponibile per quella data;
// meglio riflettere un buco reale che un valore ormai sconosciuto).
//
// Una data presente solo in `existing` (fuori dalla finestra di sync) o
// solo in `incoming` (data nuova) passa così com'è, con `sources`
// normalizzato. Ordina per data crescente, come recoveryAggregate.js.
export function mergeRecoveryRecords(existing, incoming) {
  const existingByDate = new Map();
  for (const r of Array.isArray(existing) ? existing : []) {
    if (r?.date) existingByDate.set(r.date, r);
  }
  const incomingByDate = new Map();
  for (const r of Array.isArray(incoming) ? incoming : []) {
    if (r?.date) incomingByDate.set(r.date, r);
  }

  const allDates = new Set([...existingByDate.keys(), ...incomingByDate.keys()]);
  const merged = [];
  for (const date of allDates) {
    const ex = existingByDate.get(date) || null;
    const inc = incomingByDate.get(date) || null;

    if (!inc) {
      merged.push(withNormalizedSources(ex));
      continue;
    }
    if (!ex) {
      merged.push(withNormalizedSources(inc));
      continue;
    }

    const sources = {};
    const out = { date, source: inc.source ?? ex.source };
    for (const field of RECOVERY_FIELDS) {
      if (fieldSource(ex, field) === "manual") {
        out[field] = ex[field];
        sources[field] = "manual";
      } else {
        out[field] = inc[field];
        sources[field] = fieldSource(inc, field);
      }
    }
    out.sources = sources;
    merged.push(out);
  }

  return merged.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// ─────────────────────────────────────────────────────────
// I/O — AsyncStorage
// ─────────────────────────────────────────────────────────

export async function loadRecoveryRecords() {
  try {
    const raw = await AsyncStorage.getItem(RECOVERY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const pruned = pruneToWindow(parsed);
    if (pruned.length !== parsed.length) {
      // Auto-pulizia one-shot, come la migrazione dedup del check-in: la
      // finestra avanza di un giorno ad ogni sync, quindi prima o poi ogni
      // record esce dai 90gg — meglio scriverlo pulito che ricalcolarlo
      // ad ogni load.
      await AsyncStorage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(pruned));
    }
    return pruned;
  } catch {
    return [];
  }
}

async function saveRecoveryRecords(records) {
  await AsyncStorage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(records));
}

export async function getLastSyncAt() {
  try {
    return await AsyncStorage.getItem(RECOVERY_LAST_SYNC_KEY);
  } catch {
    return null;
  }
}

async function setLastSyncAt(date) {
  await AsyncStorage.setItem(RECOVERY_LAST_SYNC_KEY, date.toISOString());
}

// Passo 8 — scollegamento: elimina sia lo storico importato sia il
// timestamp di sync, e disattiva il flag di integrazione (altrimenti il
// prossimo sync silenzioso ripopolerebbe tutto da capo — vedi
// isHealthIntegrationEnabled). Non tocca il flag di permesso storico
// (healthConnect.js, "fightclub_hc_history_permission"): non è tra i dati
// esplicitamente indicati per l'eliminazione, e resta comunque innocuo da
// solo (senza integrazione attiva, syncRecoveryData non lo consulta
// nemmeno). Non lancia mai: un fallimento qui non deve impedire
// all'utente di considerare l'operazione completata nella UI.
export async function clearRecoveryData() {
  try {
    await setHealthIntegrationEnabled(false);
    await AsyncStorage.multiRemove([RECOVERY_STORAGE_KEY, RECOVERY_LAST_SYNC_KEY]);
  } catch {
    // best-effort: vedi commento sopra
  }
}

// ─────────────────────────────────────────────────────────
// Sync — orchestrazione
// ─────────────────────────────────────────────────────────

/**
 * Legge gli ultimi `lookbackDays` giorni dal provider salute (default
 * SYNC_LOOKBACK_DAYS, il sync periodico regolare), li unisce allo storico
 * già salvato e persiste il risultato (finestra 90gg). Il parametro
 * esiste per l'import storico opt-in del passo 8 ("importa 30 giorni per
 * avere subito una baseline"): stessa funzione, finestra di lettura più
 * ampia una tantum, non un percorso separato da mantenere.
 * Non lancia mai: healthProvider.readRecoveryData() stessa non lancia (vedi
 * healthProvider.js), e ogni errore imprevisto qui viene comunque
 * catturato — un fallimento di sync deve sempre degradare a "nessun nuovo
 * dato", mai a un crash dell'app che lo invoca.
 *
 * Non fa nulla se l'utente non ha attivato l'integrazione
 * (isHealthIntegrationEnabled) — anche se il permesso OS risultasse
 * ancora concesso da una connessione precedente (Health Connect non
 * permette di revocarlo da codice): questo è il gate che rende reale lo
 * scollegamento dalla UI, non solo cosmetico.
 *
 * @param {{lookbackDays?: number}} [opts]
 * @returns {Promise<{ok: boolean, reason?: string, syncedDays?: number, totalDays?: number, lastSync?: string}>}
 */
export async function syncRecoveryData({ lookbackDays = SYNC_LOOKBACK_DAYS } = {}) {
  try {
    if (!(await isHealthIntegrationEnabled())) return { ok: false, reason: "disabled" };

    const available = await healthProvider.isAvailable();
    if (!available) return { ok: false, reason: "unavailable" };

    const toDate = new Date();
    const fromDate = new Date(toDate.getTime() - lookbackDays * 86400000);
    const incoming = await healthProvider.readRecoveryData(fromDate, toDate);

    const existing = await loadRecoveryRecords();
    const merged = pruneToWindow(mergeRecoveryRecords(existing, incoming));
    await saveRecoveryRecords(merged);
    await setLastSyncAt(toDate);

    return { ok: true, syncedDays: incoming.length, totalDays: merged.length, lastSync: toDate.toISOString() };
  } catch {
    return { ok: false, reason: "error" };
  }
}
