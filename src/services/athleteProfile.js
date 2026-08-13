// src/services/athleteProfile.js
//
// Profilo atleta esteso + Readiness score + Fase di periodizzazione.
// Alimenta l'AI Coach con contesto professionale invece di soli numeri grezzi.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { t } from "../i18n";

const PROFILE_KEY = "fightclub_athlete_profile_v1";

// ─────────────────────────────────────────────────────────
// A. PROFILO ATLETA — storage
// ─────────────────────────────────────────────────────────

export const WEIGHT_CATEGORIES = [
  "Minimosca (48kg)", "Mosca (51kg)", "Gallo (54kg)", "Piuma (57kg)",
  "Leggeri (60kg)", "Superleggeri (63.5kg)", "Welter (67kg)",
  "Mediomassimi (71kg)", "Medi (75kg)", "Mediomassimi (80kg)",
  "Massimi leggeri (86kg)", "Massimi (92kg)", "Supermassimi (+92kg)",
];

export const GUARD_TYPES = ["Destra (orthodox)", "Sinistra (southpaw)"];

export const LEVELS = ["Principiante", "Dilettante", "Dilettante elite", "Agonista", "Professionista"];

// Le costanti sopra restano SEMPRE in italiano: sono il valore salvato nel profilo,
// confrontato per l'evidenziazione del chip selezionato e usato testualmente nel
// prompt AI (in italiano indipendentemente dalla lingua dell'app, come tutto il prompt).
// Le funzioni sotto traducono SOLO per la visualizzazione, senza toccare il valore salvato.
function normKey(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function buildKeyMap(values, keys) {
  const map = {};
  values.forEach((v, i) => { map[normKey(v)] = keys[i]; });
  return map;
}

const WC_KEY_MAP = buildKeyMap(WEIGHT_CATEGORIES, [
  "wc48", "wc51", "wc54", "wc57", "wc60", "wc63", "wc67", "wc71", "wc75", "wc80", "wc86", "wc92", "wc92p",
]);
export function translateWeightCategory(raw) {
  const key = WC_KEY_MAP[normKey(raw)];
  return (key && t(`athleteProfile.weightCategories.${key}`)) || raw;
}

const GUARD_KEY_MAP = buildKeyMap(GUARD_TYPES, ["orthodox", "southpaw"]);
export function translateGuard(raw) {
  const key = GUARD_KEY_MAP[normKey(raw)];
  return (key && t(`athleteProfile.guardTypes.${key}`)) || raw;
}

const LEVEL_KEY_MAP = buildKeyMap(LEVELS, ["beginner", "amateur", "eliteAmateur", "competitor", "professional"]);
export function translateLevel(raw) {
  const key = LEVEL_KEY_MAP[normKey(raw)];
  return (key && t(`athleteProfile.levels.${key}`)) || raw;
}

const PHASE_KEY_MAP = buildKeyMap(
  ["Preparazione generale", "Transizione (post-gara)", "Competizione", "Taper (scarico pre-gara)",
    "Pre-competizione / Picco", "Preparazione specifica / Intensificazione", "Preparazione generale / Base"],
  ["generalPrep", "transition", "competition", "taper", "precompPeak", "specificPrep", "generalPrepBase"],
);
export function translatePeriodizationPhase(raw) {
  const key = PHASE_KEY_MAP[normKey(raw)];
  return (key && t(`athleteProfile.periodizationPhases.${key}`)) || raw;
}

// Gli state di computeReadiness (sotto) sono già in inglese letterale (a
// differenza delle costanti sopra, salvate in italiano) — stessa funzione
// di traduzione per coerenza con le altre, non serve normKey su accenti qui
// ma la riusiamo comunque per uniformità.
const READINESS_STATE_KEY_MAP = buildKeyMap(
  ["Recovery", "Risk of Overtraining", "Overreaching", "Accumulated Fatigue", "Ready", "Fresh", "High Performance"],
  ["recovery", "riskOvertraining", "overreaching", "accumulatedFatigue", "ready", "fresh", "highPerformance"],
);
export function translateReadinessState(raw) {
  const key = READINESS_STATE_KEY_MAP[normKey(raw)];
  return (key && t(`athleteProfile.readinessStates.${key}`)) || raw;
}

const DEFAULT_PROFILE = {
  weightCategory: null,   // stringa
  yearsExperience: null,  // numero
  fights: null,           // incontri disputati
  guard: null,            // orthodox/southpaw
  level: null,            // livello agonistico
  nextMatchDate: null,    // ISO date "YYYY-MM-DD" | null
  goal: null,             // testo libero
};

export async function saveAthleteProfile(profile) {
  const merged = { ...DEFAULT_PROFILE, ...profile };
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(merged));
  return merged;
}

export async function loadAthleteProfile() {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    return raw ? { ...DEFAULT_PROFILE, ...JSON.parse(raw) } : { ...DEFAULT_PROFILE };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function profileCompleteness(profile) {
  if (!profile) return 0;
  const keys = ["weightCategory", "yearsExperience", "fights", "guard", "level"];
  const filled = keys.filter(k => profile[k] != null && profile[k] !== "").length;
  return Math.round((filled / keys.length) * 100);
}

// ─────────────────────────────────────────────────────────
// B. READINESS SCORE
// ─────────────────────────────────────────────────────────
//
// Combina in un unico stato leggibile:
//   - TSB (forma da Training Load)
//   - trend HR (HR piu' alta a parita' di carico = affaticamento)
//   - check-in soggettivo (fatica, sonno, dolori)
//   - [opzionale] recovery oggettivo (HRV/FC a riposo/sonno da wearable)
//
// Stati (dal documento): Recovery, Fresh, Ready, High Performance,
//                        Accumulated Fatigue, Overreaching, Risk of Overtraining

function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

// ─────────────────────────────────────────────────────────
// Passo 7 — contributo opzionale del recovery oggettivo (HRV/FC a
// riposo/sonno da recoveryBaseline.js). ADDITIVO: agisce come un
// aggiustamento in punti sommato al punteggio già calcolato dai 5
// componenti esistenti, MAI come un sesto peso che ne cambia le
// proporzioni (quei 5 pesi — 22/18/22/22/16 — non sono toccati da
// questo blocco, né nel valore né nel significato: la riponderazione
// è una decisione di prodotto separata, non presa qui).
//
// Soglie duplicate deliberatamente da recoveryBaseline.js (non importate
// da lì): questo file non ha altrimenti alcuna dipendenza dal layer
// salute, e sono 3 righe di soglie, non logica — tenerle qui evita un
// accoppiamento tra "profilo/readiness" e "health" per così poco.
const RECOVERY_MIN_SAMPLES = 7;   // sotto: la metrica non entra (rule 4, confidence >= "low")
const RECOVERY_FULL_SAMPLES = 28; // da qui: peso pieno (confidence "high")
const RECOVERY_MAX_ADJUSTMENT = 8; // punti, in valore assoluto — un nudge, non una riponderazione
const RECOVERY_CONFIDENCE_LEVELS = ["low", "medium", "high"]; // "none" o assente -> non usabile

// Peso 0..1 in base al numero di campioni della SINGOLA metrica: sotto
// RECOVERY_MIN_SAMPLES è 0 (esclusa), sale linearmente fino a 1 a
// RECOVERY_FULL_SAMPLES. Una metrica con 8 campioni pesa ~0.29, una con
// 40 pesa 1 (clampato) — non lo stesso, come richiesto.
function recoverySampleWeight(n) {
  if (!Number.isFinite(n) || n < RECOVERY_MIN_SAMPLES) return 0;
  return clamp01(n / RECOVERY_FULL_SAMPLES);
}

/**
 * Calcola l'aggiustamento in punti (può essere negativo) dal recovery
 * oggettivo, e quali metriche vi hanno contribuito. Non fonde MAI il
 * sonno oggettivo con quello soggettivo del check-in: sono segnali
 * separati per definizione (un atleta può dormire 8 ore e sentirsi a
 * pezzi — è informazione, non rumore da mediare via).
 *
 * HRV assente (sampleCount 0, es. Polar Flow che non lo scrive mai) non
 * penalizza: semplicemente non entra nella media pesata, esattamente
 * come le altre metriche sotto soglia — l'assenza di un segnale non è
 * un segnale negativo.
 */
function computeRecoveryAdjustment(recovery) {
  const signals = []; // { value: -1..+1 (positivo = meglio), weight: 0..1 }
  let hrvUsed = false, restingHrUsed = false, sleepUsed = false;

  if (recovery.hrv && Number.isFinite(recovery.hrv.zToday)) {
    const w = recoverySampleWeight(recovery.hrv.sampleCount);
    if (w > 0) {
      // zToday è già in deviazioni standard rispetto alla baseline
      // (calcolato in recoveryBaseline.js): +2 SD -> pieno positivo.
      signals.push({ value: clamp(recovery.hrv.zToday / 2, -1, 1), weight: w });
      hrvUsed = true;
    }
  }

  if (recovery.restingHr && Number.isFinite(recovery.restingHr.deltaToday)) {
    const w = recoverySampleWeight(recovery.restingHr.sampleCount);
    if (w > 0) {
      // FC a riposo PIÙ ALTA della baseline è un segnale negativo (segno
      // invertito rispetto a HRV) — 5bpm di scarto: pieno negativo.
      signals.push({ value: clamp(-recovery.restingHr.deltaToday / 5, -1, 1), weight: w });
      restingHrUsed = true;
    }
  }

  if (recovery.sleep && Number.isFinite(recovery.sleep.meanEfficiency)) {
    const w = recoverySampleWeight(recovery.sleep.sampleCount);
    if (w > 0) {
      // Efficienza media (oggettiva, non il sonno auto-riferito del
      // check-in): 0.85 neutro, +-0.10 mappa al pieno range. Soglie
      // ragionevoli ma non calibrate su dati reali — da rivedere quando
      // ce ne saranno a sufficienza, non in questo passo.
      signals.push({ value: clamp((recovery.sleep.meanEfficiency - 0.85) / 0.1, -1, 1), weight: w });
      sleepUsed = true;
    }
  }

  const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
  if (totalWeight === 0) return { points: 0, hrvUsed, restingHrUsed, sleepUsed };

  const combined = signals.reduce((sum, s) => sum + s.value * s.weight, 0) / totalWeight;
  const points = Math.round(combined * RECOVERY_MAX_ADJUSTMENT);
  return { points, hrvUsed, restingHrUsed, sleepUsed };
}

/**
 * @param {object} p
 *   tsb        - Training Stress Balance corrente
 *   hrTrend    - variazione HR media (bpm); negativo = miglioramento
 *   checkIn    - { fatigue:1-5, sleep:1-5, soreness:"none"|"mild"|"severe" } | null
 *   atl        - Acute Training Load (per rilevare stato "Recovery")
 *   recovery   - [opzionale] output di computeRecoveryBaseline() | null.
 *                Assente, null, o confidence "none" -> nessun effetto,
 *                output IDENTICO al comportamento senza questo parametro.
 * @returns { score:0-100, state, color, advice, components }
 */
export function computeReadiness({ tsb = 0, hrTrend = null, checkIn = null, atl = 0, recovery = null } = {}) {
  // Componente TSB: sigmoide centrata su 0
  //   TSB +10 -> ~0.9 | TSB 0 -> ~0.6 | TSB -20 -> ~0.15
  const tsbComp = clamp01(1 / (1 + Math.exp(-(tsb + 5) / 8)));

  // Componente HR trend: -5 bpm -> 1.0 | 0 -> 0.7 | +8 -> ~0.2
  let hrComp = 0.7;
  if (hrTrend != null && Number.isFinite(hrTrend)) {
    hrComp = clamp01(0.7 - hrTrend / 15);
  }

  // Componenti soggettive
  let sleepComp = 0.7, fatigueComp = 0.7, soreComp = 0.8;
  if (checkIn) {
    sleepComp   = clamp01((Number(checkIn.sleep)   || 3) / 5);
    fatigueComp = clamp01((6 - (Number(checkIn.fatigue) || 3)) / 5);
    soreComp    = checkIn.soreness === "none" ? 1.0
                : checkIn.soreness === "mild" ? 0.6
                : checkIn.soreness === "severe" ? 0.25 : 0.7;
  }

  // Pesi INVARIATI (22/18/22/22/16): questo è esattamente il punteggio di
  // oggi, stesso calcolo, stesso arrotondamento. Il recovery oggettivo
  // (sotto) non entra qui, mai come sesto peso — vedi computeRecoveryAdjustment.
  const baseScore = Math.round(100 * (
    0.22 * tsbComp +
    0.18 * hrComp +
    0.22 * sleepComp +
    0.22 * fatigueComp +
    0.16 * soreComp
  ));

  // Recovery oggettivo: SOLO se globalmente usabile (confidence almeno
  // "low" — "none", assente o null lasciano lo score identico a oggi,
  // bit per bit). Il gate è sulla confidence GLOBALE del baseline; quale
  // singola metrica contribuisca poi è deciso da computeRecoveryAdjustment
  // (rule 4, per-metrica).
  const recoveryUsable = !!recovery && RECOVERY_CONFIDENCE_LEVELS.includes(recovery.confidence);
  const recoveryAdj = recoveryUsable ? computeRecoveryAdjustment(recovery) : null;
  const score = recoveryAdj ? clamp(baseScore + recoveryAdj.points, 0, 100) : baseScore;

  // Mappatura stato
  let state, color, advice;

  // Caso speciale Recovery: carico acuto molto basso + forma alta = fase di scarico/riposo
  if (atl < 15 && tsb > 12) {
    state = "Recovery";
    color = "#2D9CDB";
    advice = "Sei in fase di scarico. Il corpo sta assorbendo il lavoro. Riprendi gradualmente.";
  } else if (score < 32) {
    state = "Risk of Overtraining";
    color = "#B00020";
    advice = "Segnali di sovrallenamento. Riposo attivo o completo per 2-4 giorni. Nessun lavoro intenso.";
  } else if (score < 46) {
    state = "Overreaching";
    color = "#FF4D6D";
    advice = "Affaticamento marcato. Riduci volume e intensita'. Privilegia tecnica leggera e recupero.";
  } else if (score < 60) {
    state = "Accumulated Fatigue";
    color = "#FF9500";
    advice = "Fatica accumulata. Mantieni il lavoro tecnico, riduci i lavori ad alta intensita'.";
  } else if (score < 75) {
    state = "Ready";
    color = "#37E293";
    advice = "Pronto ad allenarti. Carico normale, puoi affrontare sedute di qualita'.";
  } else if (score < 88) {
    state = "Fresh";
    color = "#37E293";
    advice = "Fresco e recuperato. Ottima finestra per aumentare intensita' o volume.";
  } else {
    state = "High Performance";
    color = "#00E5FF";
    advice = "Stato ottimale. Ideale per sparring intenso, sedute chiave o test di performance.";
  }

  // components: IDENTICO a oggi (stesse 5 chiavi, stessi valori) quando
  // il recovery non è usabile — recoveryAdjustment/recoveryDetail vengono
  // aggiunte SOLO nel ramo con recovery attivo, mai come chiavi presenti-
  // ma-vuote: la forma dell'oggetto stessa resta invariata senza recovery.
  const components = {
    tsb: Math.round(tsbComp * 100),
    hr: Math.round(hrComp * 100),
    sleep: Math.round(sleepComp * 100),
    fatigue: Math.round(fatigueComp * 100),
    soreness: Math.round(soreComp * 100),
  };
  if (recoveryAdj) {
    // Non "recovery": quella chiave è nella blacklist della barriera
    // privacy di aiCoach.js (assertNoRawHealthData) — un nome diverso è
    // sufficiente perché qui non c'è comunque nessun valore grezzo, solo
    // un aggiustamento in punti già derivato, ma il nome esatto va evitato.
    components.recoveryAdjustment = recoveryAdj.points;
    components.recoveryDetail = {
      hrvUsed: recoveryAdj.hrvUsed,
      restingHrUsed: recoveryAdj.restingHrUsed,
      sleepUsed: recoveryAdj.sleepUsed,
    };
  }

  return { score, state, color, advice, components };
}

// ─────────────────────────────────────────────────────────
// C. FASE DI PERIODIZZAZIONE
// ─────────────────────────────────────────────────────────
//
// Data la data del prossimo match, deduce fase del macrociclo (Bompa/Issurin).

/**
 * @param {string|null} nextMatchDate - "YYYY-MM-DD" | null
 * @returns { phase, weeksToMatch, focus, intensity, volume }
 */
export function computePeriodization(nextMatchDate) {
  // Richiede un ISO "YYYY-MM-DD" valido: qualsiasi altro valore (null, stringa
  // malformata, data non parsabile) ricade nella fase di preparazione generale.
  const isValidIso = typeof nextMatchDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(nextMatchDate);
  const match = isValidIso ? new Date(nextMatchDate) : null;
  if (!isValidIso || Number.isNaN(match.getTime())) {
    return {
      phase: "Preparazione generale",
      weeksToMatch: null,
      focus: "Costruzione base aerobica, forza generale, volume tecnico. Nessuna gara programmata.",
      intensity: "medio-bassa",
      volume: "alto",
    };
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  match.setHours(0, 0, 0, 0);
  const days = Math.round((match - now) / 86400000);
  const weeks = Math.max(0, Math.ceil(days / 7));

  if (days < 0) {
    return {
      phase: "Transizione (post-gara)",
      weeksToMatch: weeks,
      focus: "Recupero post-competizione, scarico attivo, ripristino. Poi ritorno alla base.",
      intensity: "bassa",
      volume: "basso",
    };
  }
  if (weeks === 0) {
    return {
      phase: "Competizione",
      weeksToMatch: 0,
      focus: "Gara questa settimana. Attivazione, mantenimento, freschezza massima. Nessun carico pesante.",
      intensity: "attivazione",
      volume: "minimo",
    };
  }
  if (weeks === 1) {
    return {
      phase: "Taper (scarico pre-gara)",
      weeksToMatch: 1,
      focus: "Riduci il volume del 40-60% mantenendo l'intensita'. Massimizza la supercompensazione. Tecnica affilata, sparring breve e specifico.",
      intensity: "alta ma breve",
      volume: "molto ridotto",
    };
  }
  if (weeks <= 4) {
    return {
      phase: "Pre-competizione / Picco",
      weeksToMatch: weeks,
      focus: "Massima specificita': sparring, ritmo gara, sistema anaerobico lattacido, tattica. Intensita' alta, volume calante.",
      intensity: "alta",
      volume: "medio-basso",
    };
  }
  if (weeks <= 8) {
    return {
      phase: "Preparazione specifica / Intensificazione",
      weeksToMatch: weeks,
      focus: "Aumenta l'intensita' specifica per la boxe: intervalli ad alta intensita', potenza dei colpi, soglia anaerobica, sparring tecnico progressivo.",
      intensity: "medio-alta",
      volume: "medio-alto",
    };
  }
  return {
    phase: "Preparazione generale / Base",
    weeksToMatch: weeks,
    focus: "Costruzione della base: capacita' aerobica, forza generale, alto volume tecnico, condizionamento generale. Poni le fondamenta.",
    intensity: "medio-bassa",
    volume: "alto",
  };
}

// ─────────────────────────────────────────────────────────
// E. CARICO INTERNO — Edwards TRIMP + Session RPE
// ─────────────────────────────────────────────────────────
//
// Edwards TRIMP: somma pesata del tempo in ogni zona HR.
//   TRIMP = Σ (minuti_zona_i × peso_i)   pesi: Z1=1, Z2=2, Z3=3, Z4=4, Z5=5

/**
 * @param {object} trainingZones - { z1, z2, z3, z4, z5 } in SECONDI
 * @returns {number} Edwards TRIMP
 */
export function edwardsTRIMP(trainingZones) {
  if (!trainingZones) return 0;
  const w = { z1: 1, z2: 2, z3: 3, z4: 4, z5: 5 };
  let trimp = 0;
  for (const z of ["z1", "z2", "z3", "z4", "z5"]) {
    const min = (Number(trainingZones[z]) || 0) / 60;
    trimp += min * w[z];
  }
  return Math.round(trimp);
}

/**
 * Session RPE (Foster): carico = RPE (1-10) × durata in minuti.
 * @param {number} rpe - percezione sforzo 1-10
 * @param {number} durationMin - durata sessione in minuti
 * @returns {number} carico sRPE (AU)
 */
export function sessionRPELoad(rpe, durationMin) {
  const r = Math.max(1, Math.min(10, Number(rpe) || 0));
  const d = Math.max(0, Number(durationMin) || 0);
  return Math.round(r * d);
}

/**
 * Aggrega Edwards TRIMP delle ultime N sessioni per dare all'AI
 * un quadro del carico interno recente.
 */
export function weeklyInternalLoad(sessions, days = 7) {
  if (!Array.isArray(sessions)) return { trimp: 0, count: 0 };
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  let trimp = 0, count = 0;
  for (const s of sessions) {
    if ((s.date || "") < cutoff) continue;
    const zones = s.hrZones?.training || s.zones?.training;
    if (zones) { trimp += edwardsTRIMP(zones); count++; }
  }
  return { trimp: Math.round(trimp), count };
}
