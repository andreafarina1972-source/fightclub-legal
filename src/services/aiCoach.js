// src/services/aiCoach.js
//
// AI Coach - genera piani settimanali personalizzati.
// Supporta 3 provider: Groq (gratuito), Gemini (gratuito), Anthropic (a pagamento).

import AsyncStorage from "@react-native-async-storage/async-storage";
import { buildExerciseMenu } from "./exerciseLibrary";
import { t } from "../i18n";
import { localDateKey } from "./dateKey";

const PLAN_STORAGE_KEY    = "fightclub_ai_plan_v1";
const CHECKIN_STORAGE_KEY = "fightclub_checkin_v1";
const API_KEY_STORAGE     = "fightclub_api_key_v1";
const PROVIDER_STORAGE    = "fightclub_ai_provider_v1";

// Nome lingua (in italiano, per il prompt) per ciascun codice supportato da SUPPORTED_LANGUAGES (src/i18n/index.js)
const LANG_LABELS = {
  it: "italiano", en: "inglese", fr: "francese", de: "tedesco", es: "spagnolo",
  pt: "portoghese", ru: "russo", zh: "cinese", ja: "giapponese", ko: "coreano",
  ar: "arabo", uk: "ucraino", hi: "hindi", bn: "bengalese", pa: "punjabi",
  mr: "marathi", ur: "urdu", fa: "persiano", he: "ebraico", tr: "turco",
  vi: "vietnamita", id: "indonesiano", ms: "malese", sw: "swahili", nl: "olandese",
};

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

// Cap a 90 elementi (era 14): una baseline HRV richiede almeno 28 campioni,
// preferibilmente 60 (vedi services/health/recoveryBaseline.js). Nessuna
// migrazione di formato necessaria: la chiave resta la stessa, gli elementi
// già salvati (fino a 14) restano tutti, da qui in avanti se ne accumulano di più.
const CHECKIN_MAX_ENTRIES = 90;

// Deduplica per data LOCALE (localDateKey, non toISOString/UTC): un solo
// record per giorno, tenendo il più recente per timestamp completo quando
// ce n'è più di uno sulla stessa data. L'array in uscita è ordinato dal
// più recente al più vecchio, indipendentemente dall'ordine in ingresso —
// non assume che l'input sia già ordinato.
function dedupeCheckInsByDate(records) {
  if (!Array.isArray(records)) return [];
  const byDate = new Map();
  for (const r of records) {
    if (!r?.date) continue;
    const key = localDateKey(new Date(r.date));
    const existing = byDate.get(key);
    if (!existing || new Date(r.date) > new Date(existing.date)) {
      byDate.set(key, r);
    }
  }
  return Array.from(byDate.values()).sort((a, b) => new Date(b.date) - new Date(a.date));
}

export async function saveCheckIn(checkin) {
  const stored = await loadCheckIns();
  const now = new Date();
  // Il timestamp completo resta nel record (serve per il "più recente vince"
  // sopra); solo la CHIAVE di deduplica è la data locale, non il timestamp.
  // tzOffset (minuti, da getTimezoneOffset) non è ancora usato: servirà al
  // passo 5 per le sessioni di sonno che attraversano un cambio di fuso
  // durante la notte. Non salvarlo ora significherebbe non poterlo
  // ricostruire in seguito, quindi lo conserviamo da subito.
  const newRecord = { ...checkin, date: now.toISOString(), tzOffset: now.getTimezoneOffset() };
  const updated = dedupeCheckInsByDate([newRecord, ...stored]).slice(0, CHECKIN_MAX_ENTRIES);
  await AsyncStorage.setItem(CHECKIN_STORAGE_KEY, JSON.stringify(updated));
}

export async function loadCheckIns() {
  try {
    const raw = await AsyncStorage.getItem(CHECKIN_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const deduped = dedupeCheckInsByDate(parsed);
    if (deduped.length !== parsed.length) {
      // Migrazione one-shot: lo storico pre-esisteva a questo fix e poteva
      // contenere più record nello stesso giorno. Persiste la versione
      // deduplicata così il confronto avviene una sola volta, non ad ogni load.
      await AsyncStorage.setItem(CHECKIN_STORAGE_KEY, JSON.stringify(deduped));
    }
    return deduped;
  } catch { return []; }
}

// Estrae i nomi degli esercizi usati nell'ultimo piano generato (tutte le
// sedute con un campo exercises[], tipicamente forza/potenza/core/corsa),
// per permettere al prompt di chiedere varietà rispetto alla settimana
// precedente invece di riproporre sempre lo stesso sottoinsieme ristretto
// della libreria.
function extractPreviousExercises(plan) {
  if (!plan || !Array.isArray(plan.sessions)) return [];
  const names = new Set();
  for (const session of plan.sessions) {
    if (!Array.isArray(session?.exercises)) continue;
    for (const ex of session.exercises) {
      if (ex?.name) names.add(ex.name);
    }
  }
  return Array.from(names);
}

// ─────────────────────────────────────────────────────────
// BARRIERA PRIVACY — nessun dato sanitario grezzo (HRV, FC a riposo,
// sonno oggettivo, peso corporeo — da HealthKit/Health Connect) può
// raggiungere i provider AI (Groq/Gemini/Anthropic). buildPrompt() legge
// SOLO dai due oggetti sanificati sotto (checkIn -> {fatigue,sleep,soreness},
// readiness -> {state,score,advice}), mai dai parametri grezzi in ingresso.
// ─────────────────────────────────────────────────────────

// Estrae solo i tre campi soggettivi del check-in odierno: qualsiasi altro
// campo eventualmente presente sull'oggetto (es. in futuro dati importati
// agganciati allo stesso record) viene scartato qui, non a valle.
function sanitizeCheckIn(checkIn) {
  if (!checkIn) return null;
  return {
    fatigue: checkIn.fatigue,
    sleep: checkIn.sleep,
    soreness: checkIn.soreness,
  };
}

// Estrae solo la decisione già calcolata (etichetta, punteggio, consiglio),
// mai i sotto-punteggi di readiness.components (tsb/hr/sleep/fatigue/soreness)
// e mai, in futuro, i valori recovery grezzi che concorrono al punteggio.
function sanitizeReadiness(readiness) {
  if (!readiness) return null;
  return {
    state: readiness.state,
    score: readiness.score,
    advice: readiness.advice,
  };
}

// Chiavi che non devono MAI comparire (a qualunque profondità) nei parametri
// passati a buildPrompt: se compaiono, un dato sanitario grezzo sta per
// entrare nel testo inviato ai provider AI. Verifica attiva solo in sviluppo:
// costo dev-only, l'oggetto athleteData è comunque piccolo (nessun array
// di sessioni/routePoints al suo interno).
const FORBIDDEN_HEALTH_KEYS = ["hrv", "restingHr", "bodyWeight", "sleepMin", "efficiency", "sources", "recovery"];

function assertNoRawHealthData(athleteData) {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  const found = new Set();
  const seen = new Set();
  (function scan(obj) {
    if (!obj || typeof obj !== "object" || seen.has(obj)) return;
    seen.add(obj);
    for (const key of Object.keys(obj)) {
      if (FORBIDDEN_HEALTH_KEYS.includes(key)) found.add(key);
      const val = obj[key];
      if (val && typeof val === "object") scan(val);
    }
  })(athleteData);
  if (found.size > 0) {
    throw new Error(
      "aiCoach.buildPrompt: rilevate chiavi vietate nei parametri (dati sanitari grezzi verso l'AI): " +
        Array.from(found).join(", ")
    );
  }
}

// ─────────────────────────────────────────────────────────
// COSTRUTTORE PROMPT
// ─────────────────────────────────────────────────────────

function buildPrompt(athleteData) {
  assertNoRawHealthData(athleteData);

  const {
    ctl = 0, atl = 0, tsb = 0, weeklyTSS = 0,
    vo2max = null, vo2maxTrend = null,
    avgFightScore = null, hrTrend = null,
    adherence = 1, totalSessions = 0, currentStreak = 0,
    lastSessionType = "boxing", lastSessionDate = null,
    internalLoad = null,
    profile = null,        // A. profilo atleta
    readiness = null,      // B. readiness
    periodization = null,  // C. periodizzazione
    goal = null, checkIn = null, lang = "it",
    previousExercises = [],
  } = athleteData || {};

  const daysSinceLastSession = lastSessionDate
    ? Math.round((Date.now() - new Date(lastSessionDate).getTime()) / 86400000)
    : null;

  // Livello: dal profilo se presente, altrimenti stima
  let level = (profile && profile.level) ? String(profile.level).toLowerCase() : null;
  if (!level) {
    if (totalSessions > 100 || (vo2max && vo2max >= 50)) level = "avanzato";
    else if (totalSessions > 30 || (vo2max && vo2max >= 42)) level = "intermedio";
    else level = "principiante";
  }
  // Normalizza livelli del profilo verso le fasce delle regole di volume
  const isAdvanced = /agonist|profession|elite|avanz/.test(level);
  const isIntermediate = /dilettant|intermed/.test(level) && !isAdvanced;
  const volumeLevel = isAdvanced ? "avanzato" : isIntermediate ? "intermedio" : "principiante";

  const tsbState =
    tsb > 10   ? "ottimale (pronto per sessioni intense)" :
    tsb >= 0   ? "fresco (puo aumentare carico)" :
    tsb >= -10 ? "normale carico (monitorare)" :
    tsb >= -20 ? "affaticamento medio (privilegiare recupero)" :
                 "sovrallenamento (recupero obbligatorio)";

  // ── Blocco profilo atleta ──────────────────────────────
  let profileText = "PROFILO ATLETA:\n- Livello: " + (profile && profile.level ? profile.level : volumeLevel);
  if (profile) {
    if (profile.weightCategory) profileText += "\n- Categoria peso: " + profile.weightCategory;
    if (profile.yearsExperience != null) profileText += "\n- Esperienza: " + profile.yearsExperience + " anni";
    if (profile.fights != null) profileText += "\n- Incontri disputati: " + profile.fights;
    if (profile.guard) profileText += "\n- Guardia: " + profile.guard;
  }

  // ── Blocco readiness ───────────────────────────────────
  const safeReadiness = sanitizeReadiness(readiness);
  let readinessText = "";
  if (safeReadiness) {
    readinessText = "\nSTATO DI READINESS: " + safeReadiness.state + " (score " + safeReadiness.score + "/100)"
      + "\n- Indicazione: " + safeReadiness.advice;
  }

  // ── Blocco periodizzazione ─────────────────────────────
  let periodText = "";
  if (periodization) {
    periodText = "\nFASE DI PERIODIZZAZIONE: " + periodization.phase;
    if (periodization.weeksToMatch != null) periodText += "\n- Settimane al match: " + periodization.weeksToMatch;
    periodText += "\n- Focus fase: " + periodization.focus
      + "\n- Intensita target fase: " + periodization.intensity
      + "\n- Volume target fase: " + periodization.volume;
  }

  const safeCheckIn = sanitizeCheckIn(checkIn);
  const checkInText = safeCheckIn
    ? "\nCHECK-IN ODIERNO:\n- Fatica: " + safeCheckIn.fatigue + "/5\n- Sonno: " + safeCheckIn.sleep + "/5\n- Dolori: " + (safeCheckIn.soreness === "none" ? "nessuno" : safeCheckIn.soreness === "mild" ? "lievi" : "intensi")
    : "";

  const vo2Text = vo2max
    ? "VO2max: " + vo2max + " ml/kg/min" + (vo2maxTrend != null ? " (trend 30gg: " + (vo2maxTrend > 0 ? "+" : "") + vo2maxTrend.toFixed(1) + ")" : "")
    : "VO2max: non misurato";

  const hrTrendText = hrTrend != null
    ? "Risposta HR: " + (hrTrend < 0 ? Math.abs(hrTrend.toFixed(1)) + " bpm meno a parita di carico (miglioramento)" : "+" + hrTrend.toFixed(1) + " bpm (possibile affaticamento)")
    : "Risposta HR: dati insufficienti";

  const loadText = internalLoad && internalLoad.count > 0
    ? "\n- Carico interno 7gg (Edwards TRIMP): " + internalLoad.trimp + " AU su " + internalLoad.count + " sessioni"
    : "";

  const goalText = (goal || (profile && profile.goal)) ? "\nOBIETTIVO: " + (goal || profile.goal) : "";
  const langLabel = LANG_LABELS[lang] || "inglese";

  const volumeRules =
    "STRUTTURA SETTIMANALE COMPLETA (obbligatoria): un programma da atleta NON e' solo round di boxe. "
    + "Deve integrare preparazione tecnica, atletica e fisica specifica. Distribuisci nella settimana queste componenti:\n"
    + "  A) PUGILATO TECNICO/TATTICO: ombra, sacco, pao/colpitori, sparring condizionato o libero.\n"
    + "  B) CONDIZIONAMENTO METABOLICO SPECIFICO: circuiti ad alta intensita', lavoro intervallato boxe-specifico, bag intervals.\n"
    + "  C) CORSA / ROADWORK: fondo aerobico lungo (Z2) e ripetute/interval running per la potenza aerobica e la soglia.\n"
    + "  D) FORZA E POTENZA: pesi (forza massimale/esplosiva), pliometria, potenza del colpo, lavoro con elastici/medicine ball.\n"
    + "  E) CORE STABILITY: anti-rotazione, anti-estensione, anti-flessione laterale, bracing (Pallof, dead bug, carry, plank). Trasferisce la potenza da gambe a colpo e protegge la colonna.\n"
    + "  F) CORE FORZA/RESISTENZA e COLLO: forza e resistenza addominale, rotazione, estensori, lavoro di collo e mobilita' articolare per prevenzione infortuni.\n"
    + "  G) RECUPERO: recupero attivo, stretching, rigenerazione.\n\n"
    + "VOLUME PER LIVELLO (obbligatorio, non usare valori fissi):\n"
    + "- principiante: 3-4 sedute/settimana. Prevalenza tecnica boxe (3-4 round da 2-3 min), 1 corsa aerobica leggera, 1 sessione forza generale con core stability di base. Introdurre gradualmente.\n"
    + "- intermedio: 4-5 sedute/settimana. 2-3 sedute boxe (5-7 round da 3 min di cui una tecnica e una piu' intensa), 1-2 corse (1 fondo + 1 ripetute), 1-2 sedute forza/potenza con core stability e core forza.\n"
    + "- avanzato: livello agonistico/competitivo che si prepara a incontri. 5-6 sedute/settimana con possibili doppie sessioni. Programma COMPLETO: "
    + "3-4 sedute boxe (8-12 round da 3 min: tecnica, sacco/pao, sparring), 2 corse (1 fondo lungo Z2, 1 ripetute/interval ad alta intensita'), "
    + "2 sedute forza e potenza (forza massimale + pliometria/potenza del colpo), core stability in OGNI seduta di forza (2-3 esercizi anti-movimento) piu' core forza e collo, 1 recupero attivo. "
    + "Reale variazione di intensita' tra le sedute (polarizzato).\n"
    + "Per le sedute di boxe usa il campo workout.rounds coerente col livello " + volumeLevel + ". "
    + "Per corsa/forza/condizionamento/recupero usa durationMin (durata in minuti) e descrivi il contenuto nei drills. "
    + "NON generare un programma di sola boxe: deve essere una preparazione atletica completa adeguata al livello " + volumeLevel + ".";

  // Menu esercizi reali filtrato per livello (libreria)
  const exerciseMenu = buildExerciseMenu(volumeLevel);

  // ── SYSTEM PROMPT professionale ────────────────────────
  const systemPrompt =
    "Sei un preparatore atletico di livello olimpico specializzato nel pugilato, con formazione in fisiologia "
    + "dell'esercizio, sport science e periodizzazione moderna (Bompa, Issurin, Seiler). Applichi il modello CTL/ATL/TSB, "
    + "la distribuzione polarizzata dell'intensita' e adatti il lavoro allo stato di readiness dell'atleta.\n\n"
    + "PRINCIPI OBBLIGATORI:\n"
    + "1. Ogni seduta deve avere un chiaro sistema energetico bersaglio (aerobico, soglia, anaerobico lattacido, alattacido/potenza, recupero).\n"
    + "2. Rispetta la fase di periodizzazione indicata: in base costruisci volume aerobico e tecnica; in intensificazione alzi l'intensita' specifica; in taper riduci il volume mantenendo l'intensita'.\n"
    + "3. Adatta il carico alla readiness: se Overreaching/Accumulated Fatigue riduci intensita' e volume; se Fresh/High Performance inserisci le sedute chiave.\n"
    + "4. Le sedute di pugilato devono essere SPECIFICHE e concrete: specifica drill tecnici/tattici reali (es. 'sparring condizionato solo diretti', 'pad work combinazioni di 4 colpi', 'lavoro al sacco intervallato 15s max / 45s tecnica', 'difesa e contrattacco su jab'), MAI generici tipo 'allenamento boxe'.\n"
    + "5. Distribuzione polarizzata: gran parte del volume in bassa intensita', poche sedute realmente intense. Evita la zona grigia.\n"
    + "6. Inserisci almeno un giorno di recupero/recupero attivo a settimana, di piu' se la readiness e' bassa.\n"
    + "7. Motiva fisiologicamente ogni scelta nel campo coachNote. Volume e intensita' proporzionati al livello: per avanzati/agonisti piani completi e impegnativi, non semplificati.\n\n"
    + "Rispondi SEMPRE e SOLO con JSON valido, senza testo aggiuntivo, senza markdown, senza backtick.";

  // ── USER PROMPT ────────────────────────────────────────
  const userPrompt =
    "Genera il programma di allenamento per la PROSSIMA SETTIMANA per questo pugile.\n\n"
    + profileText + "\n"
    + readinessText + "\n"
    + periodText + "\n\n"
    + "STATO FISIOLOGICO:\n"
    + "- Sessioni totali: " + totalSessions + " | Streak: " + currentStreak + "gg\n"
    + "- Giorni dall ultima sessione: " + (daysSinceLastSession != null ? daysSinceLastSession : "sconosciuto") + " | Ultimo tipo: " + lastSessionType + "\n"
    + "- CTL: " + ctl.toFixed(1) + " | ATL: " + atl.toFixed(1) + " | TSB: " + tsb.toFixed(1) + " -> " + tsbState + "\n"
    + "- TSS settimana: " + weeklyTSS + loadText + "\n"
    + "- " + vo2Text + "\n"
    + "- " + hrTrendText + "\n"
    + "- Fight Score medio: " + (avgFightScore != null ? avgFightScore : "N/D") + " | Aderenza: " + Math.round(adherence * 100) + "%"
    + checkInText + goalText + "\n\n"
    + volumeRules + "\n\n"
    + "ESERCIZI DISPONIBILI (scegli SOLO da questa lista, sono esercizi reali con esecuzione corretta. "
    + "I nomi sono in italiano: copiali carattere per carattere in exercises[].name, ANCHE SE il resto del JSON va scritto in un'altra lingua — servono identici per abbinare la scheda tecnica lato app):\n"
    + exerciseMenu + "\n\n"
    + (previousExercises.length > 0
        ? "ESERCIZI GIA' USATI LA SETTIMANA SCORSA (evita di riproporli identici: scegli alternative dalla lista ESERCIZI DISPONIBILI per garantire varieta' e progressione, a meno che la periodizzazione richieda esplicitamente di ripetere lo stesso esercizio per progressione di carico):\n"
          + previousExercises.join(", ") + "\n\n"
        : "")
    + "Formato JSON richiesto (i valori workout nell esempio sono solo struttura, non volume: usa le REGOLE DI VOLUME per il livello " + volumeLevel + "):\n"
    + "{\n"
    + '  "weekFocus": "obiettivo principale della settimana coerente con la fase",\n'
    + '  "weekRationale": "3-4 frasi: perche questo carico e questa distribuzione in base a readiness e fase",\n'
    + '  "periodizationPhase": "nome fase",\n'
    + '  "targetWeeklyTSS": 0,\n'
    + '  "intensityDistribution": "es. 80% bassa / 20% alta (polarizzato)",\n'
    + '  "sessions": [\n'
    + '    {\n'
    + '      "day": "Lunedi | Martedi | Mercoledi | Giovedi | Venerdi | Sabato | Domenica (ESATTAMENTE uno di questi 7, sempre in italiano, NON tradurre)",\n'
    + '      "type": "boxing | running | strength | recovery | rest",\n'
    + '      "name": "nome sintetico della seduta, scritto in ' + langLabel + '",\n'
    + '      "energySystem": "aerobico | soglia | anaerobico lattacido | alattacido/potenza | recupero (ESATTAMENTE uno di questi 5, sempre in italiano, NON tradurre)",\n'
    + '      "physiologicalObjective": "cosa alleni fisiologicamente e perche, scritto in ' + langLabel + '",\n'
    + '      "drills": ["drill specifico 1", "drill specifico 2", "drill specifico 3"],\n'
    + '      "exercises": [\n'
    + '        { "name": "nome esercizio DALLA LISTA, testuale identico, NON tradotto", "sets": 4, "reps": "6-8", "durationSec": 0, "restSec": 90, "load": "es. 75% 1RM o corpo libero", "notes": "cue o variante" }\n'
    + '      ],\n'
    + '      "workout": { "prep": 300, "round": 180, "rest": 60, "rounds": 8, "cycles": 1, "cycleRest": 120 },\n'
    + '      "durationMin": 0,\n'
    + '      "intensityTarget": "es. Z2 65-75% FCmax",\n'
    + '      "rpeTarget": 6,\n'
    + '      "tssEstimate": 55,\n'
    + '      "coachNote": "motivazione fisiologica e cue tecnici"\n'
    + "    }\n"
    + "  ],\n"
    + '  "weeklyAdvice": "consiglio su recupero, sonno, nutrizione o focus mentale coerente con la fase",\n'
    + '  "alertIfTSB": null\n'
    + "}\n\n"
    + "REGOLE FINALI:\n"
    + "- Per sedute boxe compila workout (round/rest/rounds); per corsa/forza/condizionamento/recupero compila durationMin e lascia rounds a 0.\n"
    + "- Il campo exercises DEVE contenere una scheda completa di esercizi VERI scelti dalla lista ESERCIZI DISPONIBILI, con serie, ripetizioni (reps) o durata (durationSec), recupero (restSec) e carico. Dosa il volume in base a livello, readiness e fase.\n"
    + "- Per forza/pesi usa sets+reps+load+restSec; per pliometria sets+reps+restSec (recuperi ampi, qualita' non fatica); per core stability usa sets+durationSec (isometrie 20-45s) o sets+reps lente; per core forza sets+reps o durationSec; per corsa usa reps (ripetute) o durationSec (fondo) e restSec.\n"
    + "- Includi SEMPRE esercizi di CORE STABILITY (categoria Core Stability) nelle sedute di forza/potenza: sono la base del trasferimento di potenza nel colpo e della protezione della colonna.\n"
    + "- Ogni seduta di forza/potenza deve contenere ALMENO 4-6 esercizi, alternando esercizi di FORZA (categoria Forza/Pesi) ed esercizi di PLIOMETRIA/POTENZA ESPLOSIVA (categoria Pliometria), oltre al core stability richiesto sopra: sfrutta l'ampiezza della libreria, non limitarti sempre agli stessi 2-3 esercizi piu' ovvi.\n"
    + "- VARIETA' settimanale: se e' presente la lista ESERCIZI GIA' USATI LA SETTIMANA SCORSA, preferisci esercizi diversi da quella lista scegliendoli dalla lista ESERCIZI DISPONIBILI, per favorire progressione e stimolo variato nel tempo.\n"
    + "- Il programma DEVE includere corsa, forza/potenza e core/mobilita', non solo boxe (secondo la STRUTTURA SETTIMANALE per il livello).\n"
    + "- Drill/esercizi SEMPRE specifici e concreti (combinazioni, difese, footwork, sparring condizionato, pad work), mai generici.\n"
    + "- Coerenza assoluta con fase di periodizzazione e readiness sopra.\n"
    + "- Se readiness Overreaching/Risk of Overtraining: programma prevalentemente recupero e tecnica leggera.\n"
    + "- Numero sessioni e round secondo le REGOLE DI VOLUME per livello " + volumeLevel + ".\n"
    + "- Rispondi in " + langLabel + ", TRANNE tre campi che restano SEMPRE in italiano perche' sono chiavi interne usate dall'app (l'app li traduce da sola a schermo, tu non tradurli MAI): "
    + "exercises[].name (identico parola per parola alla lista ESERCIZI DISPONIBILI), day (uno dei 7 nomi giorno italiani), energySystem (uno dei 5 valori elencati sopra). "
    + "Tutti gli altri campi testuali (name, weekFocus, weekRationale, physiologicalObjective, drills, coachNote, weeklyAdvice, intensityDistribution, intensityTarget, periodizationPhase) vanno scritti in " + langLabel + ". SOLO JSON valido.";

  return { systemPrompt, userPrompt };
}

// ─────────────────────────────────────────────────────────
// CHIAMATA API
// ─────────────────────────────────────────────────────────

const PROVIDER_NAME_KEYS = { groq: "groqName", gemini: "geminiName", anthropic: "anthropicName" };
function providerDisplayName(provider) {
  const k = PROVIDER_NAME_KEYS[provider];
  return (k && t("aiCoach." + k)) || AI_PROVIDERS[provider]?.name || provider;
}

export async function generateAiPlan(athleteData, onProgress) {
  onProgress?.(t("aiCoach.analyzingData") || "Analizzando i tuoi dati...");

  // Esercizi del piano corrente (che questa generazione sta per sostituire),
  // per chiedere all'AI di variare rispetto alla settimana precedente.
  const previousPlan = await loadAiPlan();
  const previousExercises = extractPreviousExercises(previousPlan);

  const { systemPrompt, userPrompt } = buildPrompt({ ...athleteData, previousExercises });

  // Recupera chiave e provider
  const apiKey = await loadApiKey();
  if (!apiKey) {
    throw new Error(
      t("aiCoach.noApiKeyError") ||
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

  onProgress?.(t("aiCoach.consultingProvider", { provider: providerDisplayName(provider) }) || "Consultando " + providerDisplayName(provider) + "...");

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
          max_tokens: 4000,
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
          generationConfig: { maxOutputTokens: 4000, temperature: 0.7 },
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
          max_tokens: 4000,
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

  onProgress?.(t("aiCoach.elaboratingPlan") || "Elaborando il piano...");

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

  // Il "prep" è solo il conto alla rovescia prima del round 1 (mostrato come "Pronto"),
  // non fa parte dell'allenamento pubblicizzato nella card ("3 round x 3' | riposo 1'").
  // Il modello a volte copia il valore d'esempio dello schema JSON (300s = 5 minuti):
  // lo forziamo qui a un valore breve indipendentemente da cosa restituisce l'AI.
  const normalizedSessions = plan.sessions.map((s) => (
    s?.workout ? { ...s, workout: { ...s.workout, prep: 10 } } : s
  ));

  const enriched = {
    ...plan,
    sessions: normalizedSessions,
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

export function formatWorkoutParams(workout, type) {
  if (!workout) return "";
  const { round, rounds, rest, cycles, durationMin } = workout;
  const isBoxing = (type === "boxing" || type == null) && rounds > 0;

  if (isBoxing) {
    const minRound = round ? Math.round(round / 60) + "'" : "?";
    const minRest  = rest  ? Math.round(rest  / 60) + "'" : "?";
    const restLabel = t("aiCoach.restLabel") || "riposo";
    const cycleText = cycles > 1 ? " " + (t("aiCoach.cyclesSuffix", { n: cycles }) || `x ${cycles} cicli`) : "";
    return rounds + " round x " + minRound + " | " + restLabel + " " + minRest + cycleText;
  }

  // Sedute non-boxe: mostra la durata se disponibile
  if (durationMin && durationMin > 0) {
    return durationMin + " min";
  }
  return "";
}

// L'AI restituisce sempre "day" ed "energySystem" in italiano (sono chiavi interne
// usate anche per il lookup colori/icone) — qui li traduciamo SOLO per la UI,
// senza toccare il valore grezzo salvato nel piano.
function normalizeItKey(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // rimuove accenti
    .replace(/[^a-z]/g, "");
}

const DAY_KEYS = {
  lunedi: "monday", martedi: "tuesday", mercoledi: "wednesday", giovedi: "thursday",
  venerdi: "friday", sabato: "saturday", domenica: "sunday",
};

export function translateDayLabel(day) {
  const key = DAY_KEYS[normalizeItKey(day)];
  if (!key) return day;
  return t(`aiCoach.days.${key}`) || day;
}

const ENERGY_KEYS = {
  aerobico: "aerobic", soglia: "threshold", anaerobicolattacido: "anaerobicLactic",
  alattacidopotenza: "alacticPower", recupero: "recovery",
};

export function translateEnergySystemLabel(energySystem) {
  const key = ENERGY_KEYS[normalizeItKey(energySystem)];
  if (!key) return energySystem;
  return t(`aiCoach.energy.${key}`) || energySystem;
}