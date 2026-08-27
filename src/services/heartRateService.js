// src/services/heartRateService.js
// INTEGRAZIONE ANT+:
//   - Android: BLE (react-native-ble-plx) + ANT+ (react-native-ant-plus) in parallelo
//   - iOS:     solo BLE — ANT+ silenziosamente disabilitato (Platform.OS guard)
//
// Architettura:
//   entrambe le sorgenti emettono via emit() → subscribeHeartRate() invariato
//   tutti gli screen esistenti funzionano senza modifiche
//
// Priorità automatica:
//   se ANT+ è attivo e riceve dati → i dati BLE vengono ignorati (evita duplicati)
//   se ANT+ non trova nulla → BLE continua normalmente

import { Platform, PermissionsAndroid } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { toByteArray } from "base64-js";

// ─────────────────────────────────────────────
// COSTANTI GATT (BLE Heart Rate Profile)
// ─────────────────────────────────────────────
const HR_SERVICE    = "0000180d-0000-1000-8000-00805f9b34fb";
const HR_CHAR       = "00002a37-0000-1000-8000-00805f9b34fb";
const HR_MONITOR_TX = "hr_monitor_tx";

// ANT+ Device Type per fascia cardio
const ANT_HR_TYPE = 120; // AntPlusDeviceType.HEARTRATE

const HR_DEFAULT_DEVICE_KEY     = "hr_default_device_v1";
const ANT_DEFAULT_DEVICE_KEY    = "ant_default_device_v1";

// ─────────────────────────────────────────────
// EMITTER UNIFICATO (unico per BLE + ANT+)
// Tutti gli screen usano subscribeHeartRate() — invariato
// ─────────────────────────────────────────────
let lastBpm   = null;
let antActive = false; // true quando ANT+ sta ricevendo dati validi
const listeners = new Set();

function emit(bpm, source = "ble") {
  // qualunque dato arrivi (anche uno scartato sotto) conferma che la
  // sorgente autorevole del momento sta trasmettendo → stato "connected"
  emitStatus("connected");
  // se ANT+ è attivo, scarta i pacchetti BLE (evita media doppia)
  if (source === "ble" && antActive) return;
  lastBpm = bpm;
  for (const fn of listeners) {
    try { fn(bpm); } catch {}
  }
}

export function subscribeHeartRate(cb) {
  if (typeof cb === "function") listeners.add(cb);
  if (lastBpm != null && typeof cb === "function") cb(lastBpm);
  return () => listeners.delete(cb);
}

// ─────────────────────────────────────────────
// CANALE DI STATO (separato dai bpm) — "connected" | "disconnected"
// Serve a notificare gli screen di una disconnessione reale (hardware
// o manuale), cosa che subscribeHeartRate() non fa: quel canale
// trasporta solo valori bpm, mai un segnale di "silenzio".
// ─────────────────────────────────────────────
let hrStatusValue = "disconnected";
const statusListeners = new Set();

function emitStatus(status) {
  if (status === hrStatusValue) return; // dedup, niente rumore a ogni bpm
  hrStatusValue = status;
  for (const fn of statusListeners) {
    try { fn(status); } catch {}
  }
}

export function subscribeHrStatus(cb) {
  if (typeof cb === "function") statusListeners.add(cb);
  if (typeof cb === "function") cb(hrStatusValue); // replay, come subscribeHeartRate/lastBpm
  return () => statusListeners.delete(cb);
}

// ─────────────────────────────────────────────
// LAZY LOADER — BLE
// ─────────────────────────────────────────────
let BleManagerCtor = null;
let bleManager     = null;

function getBleManager() {
  if (bleManager) return bleManager;
  try {
    if (!BleManagerCtor) {
      const mod = require("react-native-ble-plx");
      BleManagerCtor = mod?.BleManager || null;
    }
    if (!BleManagerCtor) return null;
    bleManager = new BleManagerCtor();
    return bleManager;
  } catch (e) {
    console.log("❌ BLE non disponibile:", e?.message || e);
    bleManager = null;
    return null;
  }
}

// ─────────────────────────────────────────────
// LAZY LOADER — ANT+  (solo Android)
// ─────────────────────────────────────────────
let _antPlus    = null;
let _antEmitter = null;
let antLoaded   = false;

function getAnt() {
  // iOS: ANT+ non supportato → uscita immediata, nessun crash
  if (Platform.OS !== "android") return null;
  if (antLoaded) return _antPlus;

  antLoaded = true;
  try {
    const mod = require("react-native-ant-plus");
    _antPlus    = mod?.default || mod?.AntPlus || null;
    _antEmitter = mod?.AntPlusEmitter || null;
    if (_antPlus) {
      console.log("✅ ANT+ modulo caricato");
    } else {
      console.log("⚠️ ANT+ non disponibile (Expo Go o hardware assente)");
    }
  } catch (e) {
    console.log("⚠️ ANT+ non disponibile:", e?.message || e);
    _antPlus    = null;
    _antEmitter = null;
  }
  return _antPlus;
}

function getAntEmitter() {
  if (Platform.OS !== "android") return null;
  if (!antLoaded) getAnt(); // assicura il caricamento
  return _antEmitter;
}

// ─────────────────────────────────────────────
// STATO BLE
// ─────────────────────────────────────────────
let bleScanning      = false;
let bleConnecting    = false;
let bleDisconnecting = false;
let bleDevice        = null;
let bleDeviceName    = null; // nome del dispositivo BLE connesso (per UI)
let hrSub            = null;
let disconnectSub    = null;

// ─────────────────────────────────────────────
// STATO ANT+
// ─────────────────────────────────────────────
let antSearching       = false;
let antConnecting      = false; // true durante il tentativo di connect ANT+ (simmetrico a bleConnecting)
let antDeviceNumber    = null; // numero dispositivo ANT+ connesso
let antDeviceName      = null; // nome del dispositivo ANT+ connesso (per UI)
let antHrListener      = null; // subscription NativeEventEmitter
let antFoundListener   = null;
let antStateListener   = null;
let antSearchListener  = null;

// ─────────────────────────────────────────────
// STORAGE DISPOSITIVO DEFAULT
// ─────────────────────────────────────────────
export async function setDefaultHeartRateDevice(device) {
  if (!device?.id) return;
  const payload = {
    id:      device.id,
    name:    device.name || device.localName || "Dispositivo HR",
    savedAt: Date.now(),
  };
  await AsyncStorage.setItem(HR_DEFAULT_DEVICE_KEY, JSON.stringify(payload));
}

export async function getDefaultHeartRateDevice() {
  const raw = await AsyncStorage.getItem(HR_DEFAULT_DEVICE_KEY);
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    return obj?.id ? obj : null;
  } catch { return null; }
}

export async function clearDefaultHeartRateDevice() {
  await AsyncStorage.removeItem(HR_DEFAULT_DEVICE_KEY);
}

// Storage specifico ANT+
async function saveAntDevice(antDevNum, name) {
  // Guardrail: non sovrascrivere un default già esistente (ridondante col
  // gate in connectHeartRate() che oggi rende questa funzione raggiungibile
  // solo al primo uso, ma resta come ultima linea di difesa se la cascata
  // viene rifattorizzata in futuro).
  const existing = await loadAntDevice();
  if (existing?.antDeviceNumber != null) return;

  await AsyncStorage.setItem(ANT_DEFAULT_DEVICE_KEY, JSON.stringify({
    antDeviceNumber: antDevNum,
    name: name || `ANT+ HR #${antDevNum}`,
    savedAt: Date.now(),
  }));
}

async function loadAntDevice() {
  const raw = await AsyncStorage.getItem(ANT_DEFAULT_DEVICE_KEY);
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    return obj?.antDeviceNumber != null ? obj : null;
  } catch { return null; }
}

export async function getAntDefaultDevice() {
  return await loadAntDevice();
}

async function clearAntDevice() {
  await AsyncStorage.removeItem(ANT_DEFAULT_DEVICE_KEY);
}

// ─────────────────────────────────────────────
// PERMESSI ANDROID
// ─────────────────────────────────────────────
async function ensureAndroidPermissions() {
  if (Platform.OS !== "android") return true;
  const api = Platform.Version;
  try {
    if (api >= 31) {
      const res = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);
      return (
        res[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]    === PermissionsAndroid.RESULTS.GRANTED &&
        res[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED
      );
    }
    const fine = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );
    return fine === PermissionsAndroid.RESULTS.GRANTED;
  } catch { return false; }
}

async function waitForBluetoothPoweredOn(timeoutMs = 6000) {
  const mgr = getBleManager();
  if (!mgr) return false;
  try {
    const state = await mgr.state();
    if (state === "PoweredOn") return true;
    return await new Promise((resolve) => {
      const sub = mgr.onStateChange((s) => {
        if (s === "PoweredOn") { sub.remove(); resolve(true); }
      }, true);
      setTimeout(() => { sub.remove(); resolve(false); }, timeoutMs);
    });
  } catch { return false; }
}

// ─────────────────────────────────────────────
// HELPERS BLE
// ─────────────────────────────────────────────
function parseHrFromBase64(base64) {
  if (!base64) return null;
  let bytes;
  try { bytes = toByteArray(base64); } catch { return null; }
  if (!bytes || bytes.length < 2) return null;
  const flags = bytes[0];
  if ((flags & 0x01) === 0x01) {
    if (bytes.length < 3) return null;
    return bytes[1] + (bytes[2] << 8);
  }
  return bytes[1];
}

function stopBleScanSafe() {
  const mgr = getBleManager();
  if (!mgr || !bleScanning) { bleScanning = false; return; }
  try { mgr.stopDeviceScan(); } catch {}
  bleScanning = false;
}

function cleanupBleSubscriptions() {
  const mgr = getBleManager();
  try { mgr?.cancelTransaction?.(HR_MONITOR_TX); } catch {}
  try { hrSub?.remove?.(); }       catch {} hrSub = null;
  try { disconnectSub?.remove?.(); } catch {} disconnectSub = null;
}

function looksLikeHrDevice(device) {
  const uuids = (device?.serviceUUIDs || []).map((u) => (u || "").toLowerCase());
  if (uuids.includes(HR_SERVICE)) return true;
  const name = (device?.name || device?.localName || "").toLowerCase();
  if (!name) return false;
  return (
    name.includes("polar")  || name.includes("h10")    || name.includes("h9") ||
    name.includes("wahoo")  || name.includes("tickr")  || name.includes("garmin") ||
    name.includes("hrm")    || name.includes("magene") || name.includes("coospo") ||
    name.includes("heart")
  );
}

// ─────────────────────────────────────────────
// HELPERS ANT+
// ─────────────────────────────────────────────
function cleanupAntListeners() {
  try { antHrListener?.remove?.(); }     catch {} antHrListener = null;
  try { antFoundListener?.remove?.(); }  catch {} antFoundListener = null;
  try { antStateListener?.remove?.(); }  catch {} antStateListener = null;
  try { antSearchListener?.remove?.(); } catch {} antSearchListener = null;
}

async function stopAntSearchSafe() {
  const ant = getAnt();
  if (!ant || !antSearching) { antSearching = false; return; }
  try { await ant.stopSearch(); } catch {}
  antSearching = false;
}

// ─────────────────────────────────────────────
// SCAN DISPOSITIVI BLE (per UI BluetoothScreen)
// ─────────────────────────────────────────────
export async function scanHeartRateDevices({ timeoutMs = 8000, onUpdate } = {}) {
  const mgr = getBleManager();
  if (!mgr) throw new Error("BLE non disponibile (serve development build, non Expo Go)");

  const okPerm = await ensureAndroidPermissions();
  if (!okPerm) throw new Error("Permessi BLE negati");

  const btOn = await waitForBluetoothPoweredOn();
  if (!btOn) throw new Error("Bluetooth non attivo");

  stopBleScanSafe();
  const found = new Map();

  return await new Promise((resolve) => {
    bleScanning = true;
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      stopBleScanSafe();
      resolve(Array.from(found.values()));
    };

    const t = setTimeout(finish, timeoutMs);

    mgr.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
      if (done) return;
      if (error) { clearTimeout(t); finish(); return; }
      if (!device?.id || !looksLikeHrDevice(device)) return;

      if (!found.has(device.id)) {
        found.set(device.id, {
          id:           device.id,
          name:         device.name || device.localName || "Sconosciuto",
          rssi:         device.rssi ?? null,
          serviceUUIDs: device.serviceUUIDs || [],
          source:       "ble",
        });
        try { onUpdate?.(Array.from(found.values())); } catch {}
      }
    });
  });
}

// ─────────────────────────────────────────────
// SCAN DISPOSITIVI ANT+ (per UI BluetoothScreen)
// Restituisce lista device HR trovati via ANT+
// ─────────────────────────────────────────────
export async function scanAntDevices({ timeoutMs = 10000, onUpdate } = {}) {
  // iOS: ANT+ non disponibile → array vuoto senza errori
  if (Platform.OS !== "android") return [];

  const ant     = getAnt();
  const emitter = getAntEmitter();
  if (!ant || !emitter) return [];

  await stopAntSearchSafe();
  cleanupAntListeners();

  const found = new Map();
  const seconds = Math.round(timeoutMs / 1000);

  return await new Promise((resolve) => {
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      cleanupAntListeners();
      stopAntSearchSafe();
      resolve(Array.from(found.values()));
    };

    const t = setTimeout(finish, timeoutMs + 500);

    // listener dispositivo trovato
    antFoundListener = emitter.addListener("foundDevice", (dev) => {
      if (done) return;
      if (dev?.antPlusDeviceType !== ANT_HR_TYPE) return; // solo HR

      const key = String(dev.antDeviceNumber);
      if (!found.has(key)) {
        found.set(key, {
          id:              key,                               // usa antDeviceNumber come id
          antDeviceNumber: dev.antDeviceNumber,
          name:            dev.deviceDisplayName || `ANT+ HR #${dev.antDeviceNumber}`,
          rssi:            dev.rssi ?? null,
          isPreferred:     dev.isPreferredDevice  ?? false,
          isRecognized:    dev.isUserRecognizedDevice ?? false,
          source:          "ant",
        });
        try { onUpdate?.(Array.from(found.values())); } catch {}
      }
    });

    // listener fine ricerca
    antSearchListener = emitter.addListener("searchStatus", (status) => {
      if (done) return;
      if (status?.isSearching === false) { clearTimeout(t); finish(); }
    });

    // avvia ricerca ANT+
    ant.startSearch([ANT_HR_TYPE], seconds, false)
      .then(() => { antSearching = true; })
      .catch((e) => {
        console.log("❌ ANT+ startSearch error:", e?.message || e);
        clearTimeout(t);
        finish();
      });
  });
}

// ─────────────────────────────────────────────
// CONNESSIONE BLE (interna)
// ─────────────────────────────────────────────
async function connectBleDevice(deviceId, nameHint) {
  const mgr = getBleManager();
  if (!mgr) throw new Error("BLE non disponibile");

  stopBleScanSafe();
  cleanupBleSubscriptions();

  const d = await mgr.connectToDevice(deviceId, { autoConnect: false });
  bleDevice = d;
  bleDeviceName = nameHint || d.name || d.localName || null;

  try { disconnectSub?.remove?.(); } catch {}
  disconnectSub = mgr.onDeviceDisconnected(d.id, () => {
    bleDevice = null;
    bleDeviceName = null;
    cleanupBleSubscriptions();
    lastBpm = null;
    emitStatus("disconnected");
    console.log("🛑 BLE HR disconnessa (evento)");
  });

  await d.discoverAllServicesAndCharacteristics();

  try { mgr.cancelTransaction(HR_MONITOR_TX); } catch {}
  try { hrSub?.remove?.(); }  catch {} hrSub = null;

  hrSub = d.monitorCharacteristicForService(
    HR_SERVICE,
    HR_CHAR,
    (err, ch) => {
      if (err) return;
      const bpm = parseHrFromBase64(ch?.value);
      if (typeof bpm === "number" && bpm > 0 && bpm < 260) emit(bpm, "ble");
    },
    HR_MONITOR_TX
  );

  console.log("❤️ BLE HR connessa:", d.id);
  return d;
}

// ─────────────────────────────────────────────
// CONNESSIONE ANT+ (interna)
// ─────────────────────────────────────────────
async function connectAntDevice(devNumber, nameHint) {
  const ant     = getAnt();
  const emitter = getAntEmitter();
  if (!ant || !emitter) throw new Error("ANT+ non disponibile");

  // Già connessi (e attivi) a questo stesso device: nessun bisogno di
  // ripetere la connect né di smontare il listener di disconnessione
  // esistente, che è già quello corretto. Evita di lasciare lo stato
  // "connesso" senza sorveglianza se un tentativo ridondante fallisse.
  if (antDeviceNumber === devNumber && antActive) {
    return devNumber;
  }

  // ferma eventuale ricerca attiva
  await stopAntSearchSafe();
  cleanupAntListeners();

  // connetti
  const result = await ant.connect(devNumber, ANT_HR_TYPE);
  if (!result?.connected) throw new Error(`ANT+ connect fallito: state=${result?.state}`);

  antDeviceNumber = devNumber;
  antDeviceName   = nameHint || `ANT+ HR #${devNumber}`;

  // sottoscrivi eventi HR
  await ant.subscribe(devNumber, ANT_HR_TYPE, ["HeartRateData"], true);

  // listener eventi HR
  antHrListener = emitter.addListener("heartRate", (data) => {
    if (data?.antDeviceNumber !== devNumber) return;
    if (data?.event !== "HeartRateData") return;
    const bpm = data?.heartRate;
    if (typeof bpm === "number" && bpm > 0 && bpm < 260) {
      antActive = true;  // segnala che ANT+ è attivo → BLE viene messo in standby
      emit(bpm, "ant");
    }
  });

  // listener stato dispositivo (rileva disconnessione)
  antStateListener = emitter.addListener("devicesStateChange", (ev) => {
    if (ev?.antDeviceNumber !== devNumber) return;
    // state 1=CLOSED, -100=DEAD → dispositivo perso
    if (ev?.state === 1 || ev?.state === -100) {
      console.log("🛑 ANT+ HR disconnessa (stato cambio)");
      antActive       = false;
      antDeviceNumber = null;
      antDeviceName   = null;
      cleanupAntListeners();
      lastBpm = null;
      emitStatus("disconnected");
    }
  });

  console.log("📡 ANT+ HR connessa, device:", devNumber);
  return devNumber;
}

// ─────────────────────────────────────────────
// Retry diretto sullo STESSO id — recupera intoppi transitori del BLE
// Android senza mai passare da uno scan (che potrebbe agganciare un
// device diverso). Usato solo per riconnettersi al default salvato.
// ─────────────────────────────────────────────
async function connectDirectWithRetry(connectFn, retries = 1, backoffMs = 600) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, backoffMs));
    try {
      return await connectFn();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

// ─────────────────────────────────────────────
// connectHeartRate() — API PUBBLICA
//
// Strategia (Android):
//   1. Prova il dispositivo ANT+ salvato (connect-by-id, con retry diretto)
//   2. Prova il dispositivo BLE salvato (connect-by-id, con retry diretto)
//   3. Se un default esiste ma non risponde nemmeno dopo il retry: STOP,
//      nessun fallback automatico — un default salvato è una scelta
//      dell'utente, il fallback "primo trovato" non deve scavalcarla in
//      silenzio (rischio: agganciare la fascia di un altro atleta, es. in
//      una palestra affollata). Riconnettersi a un device diverso deve
//      restare un'azione esplicita (BluetoothScreen).
//   4. Solo se NON esiste alcun default (primo uso): scan ANT+ (10s) e
//      connessione al primo trovato, poi scan BLE come fallback finale
//
// iOS: salta tutto ANT+, usa solo BLE
// ─────────────────────────────────────────────
export async function connectHeartRate() {
  // Guardia simmetrica: blocca il rientro se una connessione (o un
  // tentativo) è già in corso su UNO QUALSIASI dei due trasporti. Prima
  // mancava il lato ANT+ (antDeviceNumber != null / antConnecting), il
  // che permetteva a un rientro (es. HomeScreen che torna in focus mentre
  // già connessa via ANT+) di ritentare connectAntDevice() sullo stesso
  // device e smontarne il listener di disconnessione.
  //
  // TODO(debito di test): il percorso di rientro ANT+ (guardia simmetrica
  // + connectAntDevice() che salta cleanup su stesso device attivo) NON è
  // stato validato su hardware ANT+ reale — solo il percorso BLE è stato
  // verificato su device. Il bug originale (listener smontato su rientro)
  // è nato proprio da un ramo ANT+ mai testato fisicamente: non fidarsi
  // di questa logica per l'ANT+ finché non viene provata con una fascia
  // ANT+ reale (sessione attiva → Home → altrove → Home → spegni fascia
  // → verificare che getConnectedDeviceInfo() torni null).
  if (bleDevice || bleConnecting || antDeviceNumber != null || antConnecting) return;

  const isAndroid = Platform.OS === "android";
  const ant       = isAndroid ? getAnt() : null;

  bleConnecting = true;
  antConnecting = true;

  try {
    const okPerm = await ensureAndroidPermissions();
    if (!okPerm) { console.log("❌ Permessi BLE negati"); return; }

    const btOn = await waitForBluetoothPoweredOn();
    if (!btOn) { console.log("❌ Bluetooth non attivo"); return; }

    const savedAnt = ant ? await loadAntDevice() : null;
    const savedBle = await getDefaultHeartRateDevice();
    const hasSavedDefault = (savedAnt?.antDeviceNumber != null) || !!savedBle?.id;

    // ── STEP 1: prova dispositivo ANT+ salvato (solo Android) ──────────
    if (savedAnt?.antDeviceNumber != null) {
      try {
        console.log("🔁 Provo ANT+ default:", savedAnt.name, savedAnt.antDeviceNumber);
        await connectDirectWithRetry(() => connectAntDevice(savedAnt.antDeviceNumber, savedAnt.name));
        return; // ✅ connesso via ANT+
      } catch (e) {
        console.log("⚠️ ANT+ default non raggiungibile dopo retry:", e?.message || e);
      }
    }

    // ── STEP 2: prova dispositivo BLE salvato ──────────────────────────
    if (savedBle?.id) {
      try {
        console.log("🔁 Provo BLE default:", savedBle.name, savedBle.id);
        await connectDirectWithRetry(() => connectBleDevice(savedBle.id, savedBle.name));
        return; // ✅ connesso via BLE
      } catch (e) {
        console.log("⚠️ BLE default non raggiungibile dopo retry:", e?.message || e);
      }
    }

    // ── Un default esiste ma non risponde: STOP, nessun fallback ───────
    if (hasSavedDefault) {
      console.log("❌ Default salvato non raggiungibile, nessun fallback automatico (scelta utente rispettata)");
      return;
    }

    // ── STEP 3: nessun default esistente — scan ANT+ e primo trovato ───
    if (ant) {
      console.log("🔍 Scan ANT+ (10s)...");
      const antList = await scanAntDevices({ timeoutMs: 10000 });
      if (antList?.length) {
        const first = antList[0];
        console.log("✅ ANT+ candidato:", first.name, first.antDeviceNumber);
        await connectAntDevice(first.antDeviceNumber, first.name);
        await saveAntDevice(first.antDeviceNumber, first.name); // primo uso: nessun default preesistente
        return; // ✅ connesso via ANT+
      }
      console.log("⚠️ Nessun dispositivo ANT+ trovato, provo BLE...");
    }

    // ── STEP 4: scan BLE fallback ──────────────────────────────────────
    console.log("🔍 Scan BLE...");
    const bleList = await scanHeartRateDevices({ timeoutMs: 10000 });
    if (!bleList?.length) { console.log("❌ Nessun dispositivo HR trovato"); return; }

    const first = bleList[0];
    console.log("✅ BLE candidato:", first.name, first.id);
    await connectBleDevice(first.id, first.name);

  } catch (e) {
    console.log("❌ connectHeartRate FAILED:", e?.message || e);
  } finally {
    bleConnecting = false;
    antConnecting = false;
  }
}

// ─────────────────────────────────────────────
// disconnectHeartRate() — API PUBBLICA
// Disconnette sia BLE che ANT+ se attivi
// ─────────────────────────────────────────────
export async function disconnectHeartRate() {
  if (bleDisconnecting) return;
  bleDisconnecting = true;

  try {
    stopBleScanSafe();

    // Disconnetti BLE
    const d = bleDevice;
    bleDevice = null;
    bleDeviceName = null;
    if (d) { try { await d.cancelConnection(); } catch {} }
    cleanupBleSubscriptions();

    // Disconnetti ANT+
    if (antDeviceNumber != null) {
      const ant = getAnt();
      const devNum = antDeviceNumber;
      antDeviceNumber = null;
      antDeviceName   = null;
      antActive       = false;
      cleanupAntListeners();
      if (ant) {
        try { await ant.unsubscribe(devNum, ANT_HR_TYPE, ["HeartRateData"]); } catch {}
        try { await ant.disconnect(devNum, ANT_HR_TYPE); } catch {}
      }
    }

    lastBpm = null;
    emitStatus("disconnected");
    console.log("🛑 HR disconnessa (BLE + ANT+)");
  } finally {
    bleDisconnecting = false;
  }
}

// ─────────────────────────────────────────────
// EXPORT DI STATO (utile per BluetoothScreen)
// ─────────────────────────────────────────────
export function getConnectionSource() {
  if (antDeviceNumber != null && antActive) return "ant";
  if (bleDevice)                            return "ble";
  return null;
}

// Dispositivo EFFETTIVAMENTE connesso ora (non il default salvato) —
// serve alla UI per mostrare/confrontare col default e far notare
// all'utente un eventuale aggancio a una fascia diversa dalla propria.
export function getConnectedDeviceInfo() {
  if (antDeviceNumber != null && antActive) {
    return { source: "ant", id: String(antDeviceNumber), name: antDeviceName || `ANT+ HR #${antDeviceNumber}` };
  }
  if (bleDevice) {
    return { source: "ble", id: bleDevice.id, name: bleDeviceName || bleDevice.name || bleDevice.localName || "Dispositivo HR" };
  }
  return null;
}

export async function clearAntDefaultDevice() {
  await clearAntDevice();
}