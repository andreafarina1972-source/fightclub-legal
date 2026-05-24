// src/services/aiCoach.js
//
// AI Coach - genera piani settimanali personalizzati.
// Supporta 3 provider: Groq (gratuito), Gemini (gratuito), Anthropic (a pagamento).

import AsyncStorage from "@react-native-async-storage/async-storage";

const PLAN_STORAGE_KEY    = "fightclub_ai_plan_v1";
const CHECKIN_STORAGE_KEY = "fightclub_checkin_v1";
const API_KEY_STORAGE     = "fightclub_api_key_v1";
const PROVIDER_STORAGE    = "fightclub_ai_provider_v1";

// ─────────────────────────────────────────────────────────
// PROVIDER DISPONIBILI
// ─────────────────────────────────────────────────────────

export const AI_PROVIDERS = {
  groq: {
    name: "Groq (Gratuito)",
    label: "Llama 3.3 70B",
    hint: "Gratuito, no carta. Registrati su console.groq.com",
    url: "https://console.groq.com",
    keyPrefix: "gsk_",
  },
  gemini: {
    name: "Gemini (Gratuito)",
    label: "Gemini 2.0 Flash",
    hint: "Gratuito, no carta. Registrati su aistudio.google.com",
    url: "https://aistudio.google.com",
    keyPrefix: "AIza",
  },
  anthropic: {
    name: "Anthropic Claude",
    label: "Claude Sonnet 4",
    hint: "Richiede crediti ($5 min). Registrati su console.anthropic.com",
    url: "https://console.anthropic.com",
    keyPrefix: "sk-ant-",
  },
};

/** Rileva automaticamente il provider dal formato della chiave */
export function detectProvider(key) {
  if (!key) return null;
  if (key.startsWith("gsk_"))    return "groq";
  if (key.startsWith("AIza"))    return "gemini";
  if (key.startsWith("sk-"))     return "anthropic";
  return null;
}

// ─────────────────────────────────────────────────────────
// GESTIONE API KEY + PROVIDER
// ─────────────────────────────────────────────────────────
let _cachedApiKey = null;
let _cachedProvider = null;

export async function setApiKey(key) {
  _cachedApiKey = key;
  await AsyncStorage.setItem(API_KEY_STORAGE, key);
}

export async function loadApiKey() {
  if (_cachedApiKey) return _cachedApiKey;
  try {
    const k = await AsyncStorage.getItem(API_KEY_STORAGE);
    if (k && k.length > 8) { _cachedApiKey = k; return k; }
  } catch {}
  try {
    const Constants = require("expo-constants").default;
    const k = Constants?.expoConfig?.extra?.anthropicApiKey
           || Constants?.manifest?.extra?.anthropicApiKey;
    if (k && k.length > 8) { _cachedApiKey = k; return k; }
  } catch {}
  return null;
}

export async function clearApiKey() {
  _cachedApiKey = null;
  await AsyncStorage.removeItem(API_KEY_STORAGE);
}

export async function setProvider(provider) {
  _cachedProvider = provider;
  await AsyncStorage.setItem(PROVIDER_STORAGE, provider);
}

export async function loadProvider() {
  if (_cachedProvider) return _cachedProvider;
  try {
    const p = await AsyncStorage.getItem(PROVIDER_STORAGE);
    if (p && AI_PROVIDERS[p]) { _cachedProvider = p; return p; }
  } catch {}
  return "groq";
}

// ─────────────────────────────────────────────────────────
// STORAGE PIANO
// ─────────────────────────────────────────────────────────

export async function saveAiPlan(plan) {
  await AsyncStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(plan));
}

export async function loadAiPlan() {
  try {
    const raw = await AsyncStorage.getItem(PLAN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function clearAiPlan() {
  await AsyncStorage.removeItem(PLAN_STORAGE_KEY);
}

// ─────────────────────────────────────────────────────────
// STORAGE CHECK-IN SOGGETTIVO
// ─────────────────────────────────────────────────────────

export async function saveCheckIn(checkin) {
  const stored = await loadCheckIns();
  const updated = [{ ...checkin, date: new Date().toISOString() }, ...stored].slice(0, 14);
  await AsyncStorage.setItem(CHECKIN_STORAGE_KEY, JSON.stringify(updated));
}

export async function loadCheckIns() {
  try {
    const raw = await AsyncStorage.getItem(CHECKIN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

// ─────────────────────────────────────────────────────────
// COSTRUTTORE PROMPT
// ─────────────────────────────────────────────────────────

function buildPrompt(athleteData) {
  const {
    ctl = 0, atl = 0, tsb = 0, weeklyTSS = 0,
    vo2max = null, vo2maxTrend = null,
    avgFightScore = null, hrTrend = null,
    adherence = 1, totalSessions = 0, currentStreak = 0,
    lastSessionType = "boxing", lastSessionDate = null,
    goal = null, checkIn = null, lang = "it",
  } = athleteData || {};

  const daysSinceLastSession = lastSessionDate
    ? Math.round((Date.now() - new Date(lastSessionDate).getTime()) / 86400000)
    : null;

  let level = "principiante";
  if (totalSessions > 100 || (vo2max && vo2max >= 50)) level = "avanzato";
  else if (totalSessions > 30 || (vo2max && vo2max >= 42)) level = "intermedio";

  const tsbState =
    tsb > 10   ? "ottimale (pronto per sessioni intense)" :
    tsb >= 0   ? "fresco (puo aumentare carico)" :
    tsb >= -10 ? "normale carico (monitorare)" :
    tsb >= -20 ? "affaticamento medio (privilegiare recupero)" :
                 "sovrallenamento (recupero obbligatorio)";

  const checkInText = checkIn
    ? "\nSTATO SOGGETTIVO:\n- Fatica: " + checkIn.fatigue + "/5\n- Sonno: " + checkIn.sleep + "/5\n- Dolori: " + (checkIn.soreness === "none" ? "nessuno" : checkIn.soreness === "mild" ? "lievi" : "intensi")
    : "";

  const vo2Text = vo2max
    ? "VO2max: " + vo2max + " ml/kg/min" + (vo2maxTrend != null ? " (trend 30gg: " + (vo2maxTrend > 0 ? "+" : "") + vo2maxTrend.toFixed(1) + ")" : "")
    : "VO2max: non misurato";

  const hrTrendText = hrTrend != null
    ? "Risposta HR: " + (hrTrend < 0 ? Math.abs(hrTrend.toFixed(1)) + " bpm meno a parita di carico (miglioramento)" : "+" + hrTrend.toFixed(1) + " bpm (possibile affaticamento)")
    : "Risposta HR: dati insufficienti";

  const goalText = goal ? "\nOBIETTIVO: " + goal : "";
  const langLabel = lang === "it" ? "italiano" : lang === "es" ? "spagnolo" : lang === "de" ? "tedesco" : lang === "fr" ? "francese" : "inglese";

  const systemPrompt = "Sei un preparatore atletico esperto di pugilato e arti marziali. Utilizzi la periodizzazione moderna (Bompa, Issurin) e il modello CTL/ATL/TSB. Generi piani adattativi basati sui dati fisiologici reali. Rispondi SEMPRE e SOLO con JSON valido, senza testo aggiuntivo, senza markdown, senza backtick.";

  const userPrompt = "Genera il piano di allenamento per la prossima settimana.\n\n"
    + "DATI:\n"
    + "- Livello: " + level + " | Sessioni: " + totalSessions + " | Streak: " + currentStreak + "gg\n"
    + "- Giorni dall ultima sessione: " + (daysSinceLastSession != null ? daysSinceLastSession : "sconosciuto") + " | Ultimo tipo: " + lastSessionType + "\n"
    + "- CTL: " + ctl.toFixed(1) + " | ATL: " + atl.toFixed(1) + " | TSB: " + tsb.toFixed(1) + " -> " + tsbState + "\n"
    + "- TSS settimana: " + weeklyTSS + "\n"
    + "- " + vo2Text + "\n"
    + "- " + hrTrendText + "\n"
    + "- Fight Score medio: " + (avgFightScore != null ? avgFightScore : "N/D") + " | Aderenza: " + Math.round(adherence * 100) + "%\n"
    + checkInText + goalText + "\n\n"
    + "Formato JSON richiesto:\n"
    + "{\n"
    + '  "weekFocus": "obiettivo fisiologico della settimana",\n'
    + '  "weekRationale": "2-3 frasi di spiegazione",\n'
    + '  "targetWeeklyTSS": 0,\n'
    + '  "sessions": [\n'
    + '    {\n'
    + '      "day": "Lunedi",\n'
    + '      "type": "boxing",\n'
    + '      "name": "Nome sessione",\n'
    + '      "objective": "obiettivo specifico",\n'
    + '      "workout": { "prep": 10, "round": 180, "rest": 60, "rounds": 3, "cycles": 1, "cycleRest": 120 },\n'
    + '      "intensityTarget": "Z3 70-80% HRmax",\n'
    + '      "tssEstimate": 50,\n'
    + '      "coachNote": "nota tattica"\n'
    + "    }\n"
    + "  ],\n"
    + '  "weeklyAdvice": "consiglio generale",\n'
    + '  "alertIfTSB": null\n'
    + "}\n\n"
    + "Genera 4-5 sessioni. Se TSB < -15 privilegia recupero. Rispondi in " + langLabel + ".";

  return { systemPrompt, userPrompt };
}

// ─────────────────────────────────────────────────────────
// CHIAMATA API
// ─────────────────────────────────────────────────────────

export async function generateAiPlan(athleteData, onProgress) {
  onProgress?.("Analizzando i tuoi dati...");

  const { systemPrompt, userPrompt } = buildPrompt(athleteData);

  // Recupera chiave e provider
  const apiKey = await loadApiKey();
  if (!apiKey) {
    throw new Error(
      "Nessuna API key configurata.\n\n" +
      "Vai in Impostazioni > AI Coach.\n\n" +
      "GRATUITI (no carta):\n" +
      "• Groq: console.groq.com\n" +
      "• Gemini: aistudio.google.com\n\n" +
      "A PAGAMENTO:\n" +
      "• Anthropic: console.anthropic.com"
    );
  }

  const detectedProvider = detectProvider(apiKey);
  const savedProvider = await loadProvider();
  const provider = detectedProvider || savedProvider || "anthropic";
  if (detectedProvider && detectedProvider !== savedProvider) {
    await setProvider(detectedProvider);
  }

  onProgress?.("Consultando " + (AI_PROVIDERS[provider]?.name || provider) + "...");

  let responseText = "";
  try {

    // ── GROQ ─────────────────────────────────────────────
    if (provider === "groq") {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + apiKey,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          max_tokens: 1500,
          temperature: 0.7,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user",   content: userPrompt },
          ],
        }),
      });
      if (!response.ok) {
        const err = await response.text();
        if (response.status === 401) throw new Error("Chiave Groq non valida. Verifica su console.groq.com");
        if (response.status === 429) throw new Error("Limite Groq raggiunto (1000 req/giorno). Riprova domani.");
        throw new Error("Errore Groq " + response.status + ": " + err.slice(0, 150));
      }
      const data = await response.json();
      responseText = data?.choices?.[0]?.message?.content || "";

    // ── GEMINI ───────────────────────────────────────────
    } else if (provider === "gemini") {
      const model = "gemini-2.0-flash";
      const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + apiKey;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: { maxOutputTokens: 1500, temperature: 0.7 },
        }),
      });
      if (!response.ok) {
        const err = await response.text();
        if (response.status === 400) throw new Error("Chiave Gemini non valida. Verifica su aistudio.google.com");
        if (response.status === 429) throw new Error("Limite Gemini raggiunto. Riprova tra qualche minuto.");
        throw new Error("Errore Gemini " + response.status + ": " + err.slice(0, 150));
      }
      const data = await response.json();
      responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // ── ANTHROPIC ────────────────────────────────────────
    } else {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1500,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
      if (!response.ok) {
        const err = await response.text();
        if (response.status === 401) throw new Error("Chiave Anthropic non valida.");
        if (response.status === 400 && err.includes("credit")) throw new Error("Crediti Anthropic esauriti. Ricarica su console.anthropic.com (min $5).");
        throw new Error("Errore Anthropic " + response.status + ": " + err.slice(0, 150));
      }
      const data = await response.json();
      responseText = data?.content?.[0]?.text || "";
    }

    if (!responseText) throw new Error("Risposta vuota dal modello. Riprova.");

  } catch (e) {
    console.log("aiCoach error:", e?.message);
    throw e;
  }

  onProgress?.("Elaborando il piano...");

  let plan;
  try {
    const clean = responseText
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();
    plan = JSON.parse(clean);
  } catch (e) {
    console.log("JSON parse error:", responseText.slice(0, 200));
    throw new Error("Il piano generato non e in formato valido. Riprova.");
  }

  if (!plan?.sessions || !Array.isArray(plan.sessions) || plan.sessions.length === 0) {
    throw new Error("Piano non valido: sessioni mancanti.");
  }

  const enriched = {
    ...plan,
    generatedAt: new Date().toISOString(),
    provider,
    athleteSnapshot: {
      ctl: athleteData.ctl,
      atl: athleteData.atl,
      tsb: athleteData.tsb,
      vo2max: athleteData.vo2max,
      adherence: athleteData.adherence,
    },
    completedSessionIds: [],
  };

  await saveAiPlan(enriched);
  return enriched;
}

// ─────────────────────────────────────────────────────────
// HELPERS UI
// ─────────────────────────────────────────────────────────

export function isPlanCurrentWeek(plan) {
  if (!plan?.generatedAt) return false;
  const generated = new Date(plan.generatedAt);
  const now = new Date();
  const getWeek = (d) => {
    const d2 = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d2.setUTCDate(d2.getUTCDate() + 4 - (d2.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d2.getUTCFullYear(), 0, 1));
    return Math.ceil((((d2 - yearStart) / 86400000) + 1) / 7);
  };
  return getWeek(generated) === getWeek(now) && generated.getFullYear() === now.getFullYear();
}

export function getTodaySession(plan) {
  if (!plan?.sessions) return null;
  const idx = Math.max(0, new Date().getDay() - 1);
  return plan.sessions[Math.min(idx, plan.sessions.length - 1)] || plan.sessions[0];
}

export function formatWorkoutParams(workout) {
  if (!workout) return "";
  const { round, rounds, rest, cycles } = workout;
  const minRound = round ? Math.round(round / 60) + "'" : "?";
  const minRest  = rest  ? Math.round(rest  / 60) + "'" : "?";
  const cycleText = cycles > 1 ? " x " + cycles + " cicli" : "";
  return rounds + " round x " + minRound + " | riposo " + minRest + cycleText;
}