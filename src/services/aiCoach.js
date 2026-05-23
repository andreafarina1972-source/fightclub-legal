// src/services/aiCoach.js
//
// AI Coach — genera piani settimanali personalizzati via Claude API.
//
// Flusso:
//   1. Serializza lo stato dell'atleta (CTL/ATL/TSB, VO2, trend, check-in)
//   2. Invia a Claude API con un prompt da preparatore atletico esperto
//   3. Riceve un piano JSON strutturato con le sessioni della settimana
//   4. Salva in AsyncStorage (fightclub_ai_plan_v1)
//
// Il piano si aggiorna ogni lunedì (o on-demand) e si adatta ai dati reali.

import AsyncStorage from "@react-native-async-storage/async-storage";

const PLAN_STORAGE_KEY   = "fightclub_ai_plan_v1";
const CHECKIN_STORAGE_KEY = "fightclub_checkin_v1";

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

/**
 * Costruisce il payload per Claude con tutti i dati dell'atleta.
 *
 * @param {object} athleteData
 *   ctl, atl, tsb           — Training Load corrente
 *   weeklyTSS               — TSS questa settimana
 *   vo2max                  — ultimo VO2max misurato
 *   vo2maxTrend             — variazione VO2max ultimi 30gg (+/- ml/kg/min)
 *   avgFightScore           — Fight Score medio ultime 5 sessioni
 *   hrTrend                 — variazione HR media a parità di carico (-=miglioramento)
 *   adherence               — % sessioni completate ultime 4 settimane (0-1)
 *   totalSessions           — sessioni totali storiche
 *   currentStreak           — streak giorni consecutivi
 *   lastSessionType         — "boxing" | "running"
 *   lastSessionDate         — ISO date ultima sessione
 *   goal                    — obiettivo atleta (es. "match tra 6 settimane")
 *   checkIn                 — { fatigue: 1-5, sleep: 1-5, soreness: "none"|"mild"|"severe" }
 *   lang                    — lingua app (per risposta in lingua corrente)
 */
function buildPrompt(athleteData) {
  const {
    ctl = 0, atl = 0, tsb = 0, weeklyTSS = 0,
    vo2max = null, vo2maxTrend = null,
    avgFightScore = null, hrTrend = null,
    adherence = 1, totalSessions = 0, currentStreak = 0,
    lastSessionType = "boxing", lastSessionDate = null,
    goal = null,
    checkIn = null,
    lang = "it",
  } = athleteData;

  // Calcola giorni dall'ultima sessione
  const daysSinceLastSession = lastSessionDate
    ? Math.round((Date.now() - new Date(lastSessionDate).getTime()) / 86400000)
    : null;

  // Livello atleta basato su VO2max e sessioni totali
  let level = "principiante";
  if (totalSessions > 100 || (vo2max && vo2max >= 50)) level = "avanzato";
  else if (totalSessions > 30 || (vo2max && vo2max >= 42)) level = "intermedio";

  // TSB interpretation
  const tsbState =
    tsb > 10  ? "ottimale (pronto per sessioni intense)" :
    tsb >= 0  ? "fresco (può aumentare carico)" :
    tsb >= -10 ? "normale carico (monitorare)" :
    tsb >= -20 ? "affaticamento medio (privilegiare recupero)" :
    "sovrallenamento (recupero obbligatorio)";

  const checkInText = checkIn ? `
STATO SOGGETTIVO ODIERNO:
- Fatica percepita: ${checkIn.fatigue}/5
- Qualità sonno ieri: ${checkIn.sleep}/5
- Dolori muscolari: ${checkIn.soreness === "none" ? "nessuno" : checkIn.soreness === "mild" ? "lievi" : "intensi"}` : "";

  const vo2Text = vo2max
    ? `VO2max: ${vo2max} ml/kg/min${vo2maxTrend != null ? ` (tendenza ultimi 30gg: ${vo2maxTrend > 0 ? "+" : ""}${vo2maxTrend.toFixed(1)})` : ""}`
    : "VO2max: non misurato";

  const hrTrendText = hrTrend != null
    ? `Risposta HR: ${hrTrend < 0 ? `${Math.abs(hrTrend.toFixed(1))} bpm in meno a parità di carico → MIGLIORAMENTO` : `+${hrTrend.toFixed(1)} bpm → possibile affaticamento`}`
    : "Risposta HR: dati insufficienti";

  const goalText = goal ? `\nOBIETTIVO ATLETA: ${goal}` : "";

  const systemPrompt = `Sei un preparatore atletico esperto di pugilato e arti marziali con 20 anni di esperienza. 
Utilizzi la periodizzazione moderna (Bompa, Issurin) e il modello di Training Load CTL/ATL/TSB.
Generi piani di allenamento personalizzati e adattativi basati sui dati fisiologici reali dell'atleta.
Rispondi SEMPRE e SOLO con un oggetto JSON valido, senza testo prima o dopo, senza markdown, senza backtick.`;

  const userPrompt = `Genera il piano di allenamento per la prossima settimana per questo atleta.

DATI OGGETTIVI:
- Livello: ${level}
- Sessioni totali: ${totalSessions}
- Streak corrente: ${currentStreak} giorni consecutivi
- Giorni dall'ultima sessione: ${daysSinceLastSession != null ? daysSinceLastSession : "sconosciuto"}
- Ultimo tipo allenamento: ${lastSessionType}

TRAINING LOAD:
- CTL (Fitness, τ=42gg): ${ctl.toFixed(1)}
- ATL (Fatica, τ=7gg): ${atl.toFixed(1)}
- TSB (Forma): ${tsb.toFixed(1)} → ${tsbState}
- TSS questa settimana: ${weeklyTSS}

PERFORMANCE:
- ${vo2Text}
- ${hrTrendText}
- Fight Score medio ultime 5 sessioni: ${avgFightScore != null ? avgFightScore : "non disponibile"}
- Aderenza piano ultime 4 settimane: ${Math.round(adherence * 100)}%
${checkInText}
${goalText}

FORMATO RISPOSTA — oggetto JSON con questa struttura esatta:
{
  "weekFocus": "string — obiettivo fisiologico principale della settimana (es. 'Resistenza aerobica', 'Intensità soglia')",
  "weekRationale": "string — 2-3 frasi che spiegano il ragionamento del piano basato sui dati",
  "targetWeeklyTSS": number,
  "sessions": [
    {
      "day": "string — es. 'Lunedì' o 'Giorno 1'",
      "type": "boxing" | "running" | "rest" | "recovery",
      "name": "string — nome breve sessione",
      "objective": "string — obiettivo fisiologico specifico (1 frase)",
      "workout": {
        "prep": number (secondi preparazione),
        "round": number (secondi per round),
        "rest": number (secondi riposo tra round),
        "rounds": number,
        "cycles": number,
        "cycleRest": number (secondi riposo tra cicli)
      },
      "intensityTarget": "string — es. 'Z3 70-80% HRmax'",
      "tssEstimate": number,
      "coachNote": "string — nota tattica o tecnica specifica (1-2 frasi)"
    }
  ],
  "weeklyAdvice": "string — consiglio generale per la settimana (nutrizione, recupero, focus mentale)",
  "alertIfTSB": number | null — soglia TSB sotto cui posticipare la sessione intensa
}

Genera esattamente 4-5 sessioni (inclusi eventuali giorni di recupero attivo).
Adatta i parametri workout al livello dell'atleta e allo stato di forma attuale.
Se TSB è molto negativo (< -15), privilegia sessioni di recupero e volume ridotto.
Rispondi in lingua: ${lang === "it" ? "italiano" : lang === "es" ? "spagnolo" : lang === "de" ? "tedesco" : lang === "fr" ? "francese" : "inglese"}.`;

  return { systemPrompt, userPrompt };
}

// ─────────────────────────────────────────────────────────
// CHIAMATA API CLAUDE
// ─────────────────────────────────────────────────────────

/**
 * Genera un piano settimanale AI e lo salva in AsyncStorage.
 *
 * @param {object} athleteData  — dati atleta (vedi buildPrompt)
 * @param {function} onProgress — callback opzionale con status text
 * @returns {object|null}       — piano generato o null se errore
 */
export async function generateAiPlan(athleteData, onProgress) {
  onProgress?.("Analizzando i tuoi dati...");

  const { systemPrompt, userPrompt } = buildPrompt(athleteData);

  onProgress?.("Consultando il coach AI...");

  let responseText = "";
  try {
    const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY || "";
    if (!apiKey) throw new Error("Chiave API non configurata (EXPO_PUBLIC_ANTHROPIC_API_KEY).");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
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
      throw new Error(`API error ${response.status}: ${err.slice(0, 200)}`);
    }

    const data = await response.json();
    responseText = data?.content?.[0]?.text || "";

    if (!responseText) throw new Error("Risposta vuota dall'API");

  } catch (e) {
    console.log("❌ aiCoach API error:", e?.message);
    throw e;
  }

  onProgress?.("Elaborando il piano...");

  // Parse JSON — strip eventuale markdown
  let plan;
  try {
    const clean = responseText
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();
    plan = JSON.parse(clean);
  } catch (e) {
    console.log("❌ aiCoach JSON parse error:", e?.message, "\nRaw:", responseText.slice(0, 300));
    throw new Error("Il piano generato non è in formato valido. Riprova.");
  }

  // Valida la struttura minima
  if (!plan?.sessions || !Array.isArray(plan.sessions) || plan.sessions.length === 0) {
    throw new Error("Piano non valido: sessioni mancanti.");
  }

  // Arricchisce con metadati
  const enriched = {
    ...plan,
    generatedAt:  new Date().toISOString(),
    athleteData: {
      ctl: athleteData.ctl,
      atl: athleteData.atl,
      tsb: athleteData.tsb,
      vo2max: athleteData.vo2max,
      adherence: athleteData.adherence,
    },
    completedSessionIds: [], // verrà popolato man mano
  };

  await saveAiPlan(enriched);
  return enriched;
}

// ─────────────────────────────────────────────────────────
// HELPERS PER LA UI
// ─────────────────────────────────────────────────────────

/** Verifica se il piano è della settimana corrente */
export function isPlanCurrentWeek(plan) {
  if (!plan?.generatedAt) return false;
  const generated = new Date(plan.generatedAt);
  const now = new Date();
  // Stessa settimana ISO
  const getWeek = (d) => {
    const d2 = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d2.setUTCDate(d2.getUTCDate() + 4 - (d2.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d2.getUTCFullYear(), 0, 1));
    return Math.ceil((((d2 - yearStart) / 86400000) + 1) / 7);
  };
  return (
    getWeek(generated) === getWeek(now) &&
    generated.getFullYear() === now.getFullYear()
  );
}

/** Sessione del giorno (in base al giorno della settimana) */
export function getTodaySession(plan) {
  if (!plan?.sessions) return null;
  const dayIndex = new Date().getDay(); // 0=dom, 1=lun...
  // Mappa italiano → index (approssimativo, il coach usa "Giorno N")
  const idx = Math.max(0, dayIndex - 1); // lunedì = index 0
  return plan.sessions[Math.min(idx, plan.sessions.length - 1)] || plan.sessions[0];
}

/** Formatta i parametri workout in testo leggibile */
export function formatWorkoutParams(workout) {
  if (!workout) return "";
  const { round, rounds, rest, cycles } = workout;
  const minRound = round ? `${Math.round(round / 60)}'` : "?";
  const minRest  = rest  ? `${Math.round(rest / 60)}'` : "?";
  const cycleText = cycles > 1 ? ` × ${cycles} cicli` : "";
  return `${rounds} round × ${minRound} | riposo ${minRest}${cycleText}`;
}