// src/services/cornermanAI.js
//
// Cornerman AI — feedback vocale tra un round e l'altro.
//
// Architettura:
//   speakCornermanFeedback(data) → costruisce la frase → parla via expo-speech
//
// Si integra in TimerScreen con un useEffect su phase === "rest":
//   quando il round finisce, chiama questa funzione con i dati del round appena chiuso.
//
// Usa voiceCoach.js per: voce, lingua, toggle ON/OFF.
// Non ha dipendenze aggiuntive oltre a quelle già installate.

import { getVoiceCoachEnabled, stopVoice } from "./voiceCoach";

// ─────────────────────────────────────────────────────────
// HELPERS INTERNI
// ─────────────────────────────────────────────────────────

function getSpeechSafe() {
  try {
    return require("expo-speech");
  } catch {
    return null;
  }
}

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
  if (l === "de") return "de-DE";
  if (l === "fr") return "fr-FR";
  if (l === "pt") return "pt-PT";
  if (l === "ru") return "ru-RU";
  if (l === "ar") return "ar-SA";
  if (l === "ja") return "ja-JP";
  if (l === "ko") return "ko-KR";
  if (l === "zh") return "zh-CN";
  return "en-US";
}

// Zona HR descritta in parole
function hrZoneLabel(zone, lang) {
  const labels = {
    it: { 1: "recupero", 2: "aerobico base", 3: "aerobico", 4: "soglia", 5: "massimale" },
    en: { 1: "recovery", 2: "aerobic base", 3: "aerobic", 4: "threshold", 5: "max" },
    es: { 1: "recuperación", 2: "base aeróbica", 3: "aeróbico", 4: "umbral", 5: "máximo" },
    de: { 1: "Erholung", 2: "Grundlage", 3: "Aerob", 4: "Schwelle", 5: "Maximum" },
    fr: { 1: "récupération", 2: "aérobie base", 3: "aérobie", 4: "seuil", 5: "maximum" },
  };
  const l = String(lang || "en").toLowerCase().slice(0, 2);
  const map = labels[l] || labels.en;
  return map[zone] || map[3];
}

// HR% su HRmax → zona 1-5
function hrZone(hrBpm, hrMax) {
  if (!hrBpm || !hrMax || hrMax <= 0) return null;
  const p = hrBpm / hrMax;
  if (p < 0.60) return 1;
  if (p < 0.70) return 2;
  if (p < 0.80) return 3;
  if (p < 0.90) return 4;
  return 5;
}

// Ritmo colpi/minuto → aggettivo
function paceLabel(punchesInRound, roundSeconds, lang) {
  if (!punchesInRound || roundSeconds <= 0) return null;
  const ppm = (punchesInRound / roundSeconds) * 60;
  const l = String(lang || "en").toLowerCase().slice(0, 2);

  const labels = {
    it: {
      low: "bassa cadenza",
      mid: "buon ritmo",
      high: "ritmo elevato",
      vhigh: "ritmo esplosivo",
    },
    en: {
      low: "low pace",
      mid: "good pace",
      high: "high pace",
      vhigh: "explosive pace",
    },
    es: {
      low: "ritmo bajo",
      mid: "buen ritmo",
      high: "ritmo alto",
      vhigh: "ritmo explosivo",
    },
    de: {
      low: "niedriges Tempo",
      mid: "gutes Tempo",
      high: "hohes Tempo",
      vhigh: "explosives Tempo",
    },
    fr: {
      low: "rythme faible",
      mid: "bon rythme",
      high: "rythme élevé",
      vhigh: "rythme explosif",
    },
  };
  const m = labels[l] || labels.en;
  if (ppm < 20) return m.low;
  if (ppm < 40) return m.mid;
  if (ppm < 60) return m.high;
  return m.vhigh;
}

// ─────────────────────────────────────────────────────────
// COSTRUTTORE TESTO — multilingua
// ─────────────────────────────────────────────────────────

/**
 * Costruisce la frase del Cornerman in base ai dati del round.
 *
 * @param {object} data
 *   roundNumber    - numero del round appena finito
 *   totalRounds    - round totali previsti
 *   punchesThisRound - colpi nel round
 *   punchesTotal   - colpi totali sessione
 *   hrPeak         - HR picco nel round (bpm)
 *   hrAvg          - HR media nel round (bpm)
 *   hrMax          - HRmax atleta (per calcolare zona)
 *   roundSeconds   - durata del round in secondi
 *   isLastRound    - booleano: era l'ultimo round?
 * @param {string} lang - codice lingua (es. "it", "en")
 */
function buildCornermanText(data, lang) {
  const {
    roundNumber = 1,
    totalRounds = 3,
    punchesThisRound = 0,
    punchesTotal = 0,
    hrPeak = null,
    hrAvg = null,
    hrMax = 190,
    roundSeconds = 180,
    isLastRound = false,
  } = data || {};

  const l = String(lang || "en").toLowerCase().slice(0, 2);
  const zone = hrPeak ? hrZone(hrPeak, hrMax) : null;
  const zoneName = zone ? hrZoneLabel(zone, l) : null;
  const pace = paceLabel(punchesThisRound, roundSeconds, l);

  // Calcola trend colpi (rispetto a media precedenti round)
  // Se non abbiamo storico, usiamo solo questo round
  const nextRound = roundNumber + 1;
  const roundsLeft = totalRounds - roundNumber;

  // ── Template per lingua ────────────────────────────────
  if (l === "it") {
    const parts = [];

    // Intro round
    if (isLastRound) {
      parts.push(`Fine sessione.`);
    } else {
      parts.push(`Fine ripresa ${roundNumber}.`);
    }

    // Colpi
    if (punchesThisRound > 0) {
      parts.push(`${punchesThisRound} colpi.`);
      if (punchesTotal > punchesThisRound) {
        parts.push(`Totale ${punchesTotal}.`);
      }
    }

    // Zona HR
    if (zoneName && hrPeak) {
      parts.push(`Frequenza picco ${hrPeak}, zona ${zoneName}.`);
    }

    // Cadenza
    if (pace && punchesThisRound > 0) {
      parts.push(`${pace.charAt(0).toUpperCase() + pace.slice(1)}.`);
    }

    // Consiglio tattico
    if (!isLastRound) {
      if (zone >= 5) {
        parts.push(`Recupera bene. ${roundsLeft} ripres${roundsLeft === 1 ? "a" : "e"} ancora.`);
      } else if (zone <= 2) {
        parts.push(`Puoi aumentare l'intensità. Mancano ${roundsLeft} ripres${roundsLeft === 1 ? "a" : "e"}.`);
      } else {
        parts.push(`Buon lavoro. Mancano ${roundsLeft} ripres${roundsLeft === 1 ? "a" : "e"}.`);
      }
    } else {
      parts.push(`Totale sessione: ${punchesTotal} colpi.`);
    }

    return parts.join(" ");
  }

  if (l === "es") {
    const parts = [];
    if (isLastRound) {
      parts.push(`Fin de la sesión.`);
    } else {
      parts.push(`Fin del asalto ${roundNumber}.`);
    }
    if (punchesThisRound > 0) parts.push(`${punchesThisRound} golpes.`);
    if (zoneName && hrPeak) parts.push(`Frecuencia pico ${hrPeak}, zona ${zoneName}.`);
    if (pace && punchesThisRound > 0) parts.push(`${pace}.`);
    if (!isLastRound) {
      if (zone >= 5) parts.push(`Recupera bien. Quedan ${roundsLeft} asalto${roundsLeft !== 1 ? "s" : ""}.`);
      else if (zone <= 2) parts.push(`Puedes aumentar la intensidad. Quedan ${roundsLeft} asalto${roundsLeft !== 1 ? "s" : ""}.`);
      else parts.push(`Buen trabajo. Quedan ${roundsLeft} asalto${roundsLeft !== 1 ? "s" : ""}.`);
    } else {
      parts.push(`Total: ${punchesTotal} golpes.`);
    }
    return parts.join(" ");
  }

  if (l === "de") {
    const parts = [];
    if (isLastRound) parts.push(`Sitzung beendet.`);
    else parts.push(`Runde ${roundNumber} beendet.`);
    if (punchesThisRound > 0) parts.push(`${punchesThisRound} Treffer.`);
    if (zoneName && hrPeak) parts.push(`Puls Spitze ${hrPeak}, Zone ${zoneName}.`);
    if (!isLastRound) {
      if (zone >= 5) parts.push(`Gut erholen. Noch ${roundsLeft} Runde${roundsLeft !== 1 ? "n" : ""}.`);
      else parts.push(`Weiter so. Noch ${roundsLeft} Runde${roundsLeft !== 1 ? "n" : ""}.`);
    } else {
      parts.push(`Gesamt: ${punchesTotal} Treffer.`);
    }
    return parts.join(" ");
  }

  if (l === "fr") {
    const parts = [];
    if (isLastRound) parts.push(`Fin de la séance.`);
    else parts.push(`Fin du round ${roundNumber}.`);
    if (punchesThisRound > 0) parts.push(`${punchesThisRound} coups.`);
    if (zoneName && hrPeak) parts.push(`Fréquence maximale ${hrPeak}, zone ${zoneName}.`);
    if (!isLastRound) {
      if (zone >= 5) parts.push(`Récupère bien. Encore ${roundsLeft} round${roundsLeft !== 1 ? "s" : ""}.`);
      else parts.push(`Bon travail. Encore ${roundsLeft} round${roundsLeft !== 1 ? "s" : ""}.`);
    } else {
      parts.push(`Total: ${punchesTotal} coups.`);
    }
    return parts.join(" ");
  }

  // Default: English
  {
    const parts = [];
    if (isLastRound) parts.push(`Session complete.`);
    else parts.push(`Round ${roundNumber} done.`);
    if (punchesThisRound > 0) parts.push(`${punchesThisRound} punches.`);
    if (punchesTotal > punchesThisRound) parts.push(`${punchesTotal} total.`);
    if (zoneName && hrPeak) parts.push(`HR peak ${hrPeak}, ${zoneName} zone.`);
    if (pace && punchesThisRound > 0) parts.push(`${pace.charAt(0).toUpperCase() + pace.slice(1)}.`);
    if (!isLastRound) {
      if (zone >= 5) parts.push(`Recover well. ${roundsLeft} round${roundsLeft !== 1 ? "s" : ""} left.`);
      else if (zone <= 2) parts.push(`Push harder. ${roundsLeft} round${roundsLeft !== 1 ? "s" : ""} left.`);
      else parts.push(`Good work. ${roundsLeft} round${roundsLeft !== 1 ? "s" : ""} left.`);
    } else {
      parts.push(`Total punches: ${punchesTotal}.`);
    }
    return parts.join(" ");
  }
}

// ─────────────────────────────────────────────────────────
// EXPORT PRINCIPALE
// ─────────────────────────────────────────────────────────

/**
 * Parla il feedback del cornerman dopo la fine di un round.
 * Rispetta il toggle voiceCoachEnabled delle Settings.
 *
 * @param {object} data  - dati del round (vedi buildCornermanText)
 * @param {number} [delayMs=800] - ritardo dopo il gong di fine round (ms)
 */
export async function speakCornermanFeedback(data, delayMs = 800) {
  // Rispetta il toggle "voice coach" già presente nelle Settings
  const enabled = await getVoiceCoachEnabled();
  if (!enabled) return;

  const S = getSpeechSafe();
  if (!S?.speak) return;

  const lang = getAppLang();
  const text = buildCornermanText(data, lang);
  if (!text) return;

  // Breve pausa dopo il gong per non sovrapporsi al suono
  await new Promise((r) => setTimeout(r, delayMs));

  try {
    stopVoice(); // ferma qualsiasi annuncio precedente
    S.speak(text, {
      language: langToSpeechTag(lang),
      rate: 0.92,   // leggermente più lento per chiarezza
      pitch: 1.0,
    });
  } catch (e) {
    console.log("⚠️ Cornerman speak error:", e?.message);
  }
}

/**
 * Testo del cornerman senza parlare (utile per debug o preview UI).
 */
export function getCornermanText(data) {
  const lang = getAppLang();
  return buildCornermanText(data, lang);
}