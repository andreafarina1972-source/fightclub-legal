// src/services/voiceCoach.js

let Speech = null;
let cachedVoiceId = null;

const VOICE_ENABLED_KEY = "voiceCoachEnabled";
let voiceEnabledCache = null;

function getSpeechSafe() {
  if (Speech) return Speech;
  try {
    Speech = require("expo-speech");
    return Speech;
  } catch (e) {
    console.log("⚠️ expo-speech non disponibile:", e?.message);
    return null;
  }
}

function getStorageSafe() {
  try {
    return require("@react-native-async-storage/async-storage")?.default || null;
  } catch {
    return null;
  }
}

// ✅ lingua app da i18n (fallback en)
function getAppLang() {
  try {
    const mod = require("../i18n");
    const locale = mod?.i18n?.locale || mod?.i18n?.currentLocale || "en";
    return String(locale).split(/[-_]/)[0].toLowerCase() || "en";
  } catch {
    return "en";
  }
}

function langToSpeechTag(lang) {
  const l = String(lang || "en").toLowerCase();
  if (l === "it") return "it-IT";
  if (l === "es") return "es-ES";
  return "en-US";
}

// ✅ UNA sola voce “donna”: scelta 1 volta e riutilizzata per tutte le lingue
async function pickFemaleVoiceIdOnce() {
  if (cachedVoiceId) return cachedVoiceId;

  const S = getSpeechSafe();
  if (!S?.getAvailableVoicesAsync) return null;

  try {
    const voices = await S.getAvailableVoicesAsync();
    if (!Array.isArray(voices) || voices.length === 0) return null;

    const chosen =
      // prova femminile IT
      voices.find((v) => {
        const lang = String(v.language || "").toLowerCase();
        const name = String(v.name || "").toLowerCase();
        const gender = String(v.gender || "").toLowerCase();
        const isIt = lang.startsWith("it") || name.includes("ital");
        const isFemale =
          gender === "female" ||
          name.includes("female") ||
          name.includes("fem") ||
          name.includes("donna");
        return isIt && isFemale;
      }) ||
      // fallback: prima IT
      voices.find((v) => String(v.language || "").toLowerCase().startsWith("it")) ||
      // fallback: prima disponibile
      voices[0];

    cachedVoiceId = chosen?.identifier || chosen?.id || null;
    return cachedVoiceId;
  } catch (e) {
    console.log("⚠️ getAvailableVoicesAsync error:", e?.message);
    return null;
  }
}

// -----------------------------
// Toggle ON/OFF (persistente)
// -----------------------------
export async function getVoiceCoachEnabled() {
  if (voiceEnabledCache !== null) return voiceEnabledCache;

  const storage = getStorageSafe();
  if (!storage?.getItem) {
    voiceEnabledCache = true; // default ON
    return voiceEnabledCache;
  }

  try {
    const v = await storage.getItem(VOICE_ENABLED_KEY);
    voiceEnabledCache = v === null ? true : v !== "false";
    return voiceEnabledCache;
  } catch {
    voiceEnabledCache = true;
    return voiceEnabledCache;
  }
}

export async function setVoiceCoachEnabled(enabled) {
  const storage = getStorageSafe();
  voiceEnabledCache = !!enabled;

  if (!storage?.setItem) return voiceEnabledCache;

  try {
    await storage.setItem(VOICE_ENABLED_KEY, voiceEnabledCache ? "true" : "false");
  } catch {}
  return voiceEnabledCache;
}

export function stopVoice() {
  const S = getSpeechSafe();
  try {
    S?.stop?.();
  } catch {}
}

// -----------------------------
// SOLO ROUND START
// -----------------------------
function ordinalRoundIt(n) {
  const map = {
    1: "prima",
    2: "seconda",
    3: "terza",
    4: "quarta",
    5: "quinta",
    6: "sesta",
    7: "settima",
    8: "ottava",
    9: "nona",
    10: "decima",
    11: "undicesima",
    12: "dodicesima",
  };
  return map[n] || `${n}ª`;
}

function roundStartText(n, lang) {
  const l = String(lang || "en").toLowerCase();
  if (l === "it") {
    const ord = ordinalRoundIt(n);
    return n <= 12 ? `Inizio ${ord} ripresa` : `Inizio ripresa ${n}`;
  }
  if (l === "es") return `Comienza el asalto ${n}`;
  return `Round ${n} start`;
}

export async function speakRoundStart(roundNumber) {
  const enabled = await getVoiceCoachEnabled();
  if (!enabled) return;

  const S = getSpeechSafe();
  if (!S?.speak) return;

  const n = Number(roundNumber);
  if (!Number.isFinite(n) || n <= 0) return;

  try {
    const lang = getAppLang();
    const voiceId = await pickFemaleVoiceIdOnce();

    S.stop?.();

    const payload = {
      language: langToSpeechTag(lang),
      rate: 0.95,
      pitch: 1.05,
    };

    if (voiceId) {
      payload.voice = voiceId;
      payload.voiceId = voiceId;
    }

    S.speak(roundStartText(n, lang), payload);
  } catch (e) {
    console.log("⚠️ Speech error:", e?.message);
  }
}
