// src/services/soundManager.js
import { Audio } from "expo-av";
import AsyncStorage from "@react-native-async-storage/async-storage";

let sounds = {};
let volumes = {};
let soundEnabled = true;
let soundsLoaded = false;

// Suoni individuali controllabili (compat: "countdown" -> count1)
let soundEnabledMap = {
  beep: true,
  countdown: true,
  gong: true,
};

// ============================================================================
// Utils
// ============================================================================
function normalizeKey(key) {
  if (key === "count1") return "countdown";
  return key;
}

async function loadSound(source) {
  const { sound } = await Audio.Sound.createAsync(source);
  return sound;
}

function getStorageKey(key) {
  const k = normalizeKey(key);
  if (k === "countdown") return "volCount1"; // ✅ chiave corretta
  if (k === "beep") return "volBeep";
  if (k === "gong") return "volGong";
  return k;
}

// ============================================================================
// Caricamento impostazioni
// ============================================================================
async function loadAudioSettings() {
  try {
    const enabled = await AsyncStorage.getItem("soundEnabled");
    soundEnabled = enabled === null ? true : enabled === "true";

    volumes.beep = parseFloat(await AsyncStorage.getItem("volBeep")) || 1;
    volumes.gong = parseFloat(await AsyncStorage.getItem("volGong")) || 1;

    // ✅ FIX: prima leggeva "volCount" (sbagliato) e poi non combaciava
    volumes.count1 = parseFloat(await AsyncStorage.getItem("volCount1")) || 1;

    console.log("🔧 Volumi caricati", volumes);
  } catch (err) {
    console.log("⚠ Errore caricamento volumi", err);
  }
}

async function loadSoundEnableSettings() {
  try {
    soundEnabledMap.beep =
      (await AsyncStorage.getItem("soundEnabled_beep")) !== "false";

    // compat: chiave storica "countdown"
    soundEnabledMap.countdown =
      (await AsyncStorage.getItem("soundEnabled_countdown")) !== "false";

    soundEnabledMap.gong =
      (await AsyncStorage.getItem("soundEnabled_gong")) !== "false";

    console.log("🔧 Suoni ON/OFF caricati:", soundEnabledMap);
  } catch (err) {
    console.log("⚠ Errore caricamento ON/OFF individuali", err);
  }
}

// ============================================================================
// API: caricamento suoni
// ============================================================================
export async function loadSounds() {
  if (soundsLoaded) {
    console.log("✔ Suoni già caricati");
    return;
  }

  console.log("🎧 Caricamento suoni…");

  await loadAudioSettings();
  await loadSoundEnableSettings();

  // Percorsi: src/services -> ../../assets
  sounds.beep = await loadSound(require("../../assets/sounds/playbeep.mp3"));
  sounds.gong = await loadSound(require("../../assets/sounds/playgong.mp3"));
  sounds.count1 = await loadSound(require("../../assets/sounds/playCount1.mp3"));

  // Applica volume
  for (const key of Object.keys(sounds)) {
    const volume = volumes[key] ?? 1;
    try {
      await sounds[key].setVolumeAsync(volume);
    } catch (e) {
      console.log("⚠ Errore setVolumeAsync", key, e);
    }
  }

  soundsLoaded = true;
  console.log("✔ TUTTI I SUONI CARICATI");
}

// ============================================================================
// API: enable/volume
// ============================================================================
export async function setSoundEnabledSingle(key, value) {
  const k = normalizeKey(key);
  soundEnabledMap[k] = value;

  // compat: countdown resta countdown
  await AsyncStorage.setItem(`soundEnabled_${k}`, value.toString());
  console.log(`🔕 Suono '${k}' impostato a: ${value}`);
}

export async function setSoundVolume(key, value) {
  const k = normalizeKey(key);
  const v = Math.max(0, Math.min(1, Number(value)));

  // salva su storage
  await AsyncStorage.setItem(getStorageKey(k), String(v));

  // aggiorna cache
  if (k === "countdown") volumes.count1 = v;
  else volumes[k] = v;

  // applica live se caricato
  const soundKey = k === "countdown" ? "count1" : k;
  if (soundsLoaded && sounds[soundKey]) {
    try {
      await sounds[soundKey].setVolumeAsync(v);
    } catch (e) {
      console.log("⚠ Errore setVolumeAsync", soundKey, e);
    }
  }

  console.log(`🔊 Volume ${soundKey} = ${v}`);
}

// ============================================================================
// Riproduzione sicura
// ============================================================================
async function safePlay(key) {
  try {
    // master switch
    if (!soundEnabled) return;

    // assicurati che i suoni siano caricati
    if (!soundsLoaded) {
      await loadSounds();
    }

    // blocchi individuali
    const k = normalizeKey(key);
    if (k === "beep" && !soundEnabledMap.beep) return;
    if (k === "gong" && !soundEnabledMap.gong) return;
    if (k === "countdown" && !soundEnabledMap.countdown) return;

    const soundKey = k === "countdown" ? "count1" : k;
    const sound = sounds[soundKey];
    if (!sound) return;

    await sound.replayAsync();
  } catch (err) {
    console.log("⚠ Errore audio:", err);
  }
}

// ============================================================================
// API pubbliche
// ============================================================================
export const playBeep = () => safePlay("beep");
export const playGong = () => safePlay("gong");
export const playCount1 = () => safePlay("count1");
