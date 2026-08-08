// src/services/badgeEngine.js
//
// Sistema badge e streak per FightClub.
// Calcolo puramente derivato da sessions[] e vo2Measurements[] di HistoryContext.
// Nessun storage separato — i badge si ricalcolano on-the-fly (istantaneo, <1ms).

import { t } from "../i18n";

// ─────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────

function safeNum(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

/** Restituisce "YYYY-MM-DD" da una stringa ISO o timestamp */
function toDateKey(raw) {
  if (!raw) return null;
  try { return new Date(raw).toISOString().slice(0, 10); }
  catch { return null; }
}

// ─────────────────────────────────────────────────────────
// STATISTICHE AGGREGATE (usate da tutti i badge)
// ─────────────────────────────────────────────────────────

/**
 * Calcola tutte le statistiche necessarie in una sola passata O(n).
 * @param {object[]} sessions
 * @param {object[]} vo2Measurements
 */
export function computeStats(sessions, vo2Measurements) {
  const sess = Array.isArray(sessions) ? sessions : [];
  const vo2  = Array.isArray(vo2Measurements) ? vo2Measurements : [];

  // ── Colpi ────────────────────────────────────────────────
  let totalPunches = 0;
  let maxPunchesInSession = 0;
  let maxPunchesInRound   = 0;

  // ── Distanza running ─────────────────────────────────────
  let totalRunningKm = 0;
  let maxRunningKm   = 0;

  // ── Round ────────────────────────────────────────────────
  let totalRounds = 0;

  // ── Sessioni ─────────────────────────────────────────────
  let totalSessions = sess.length;
  let totalWorkoutSessions  = 0;
  let totalRunningSessions  = 0;

  // ── Durata ───────────────────────────────────────────────
  let totalMinutes = 0;

  // ── HR ───────────────────────────────────────────────────
  let maxHrSeen = 0;

  // ── Fight Score ──────────────────────────────────────────
  let maxFightScore = 0;

  // ── Giorni con sessione (per streak) ─────────────────────
  const daySet = new Set();

  for (const s of sess) {
    const punches  = safeNum(s.punches);
    const distM    = safeNum(s.distanceM);
    const km       = distM / 1000;
    const type     = (s.type || "workout").toLowerCase();
    const dur      = safeNum(s.totalSeconds || s.elapsed || s.durationSeconds || 0) / 60
                   + safeNum(s.totalMinutes);
    const avgHr    = safeNum(s.avgHr);
    const hrMax    = safeNum(s.hrZones?.hrMax || s.zones?.hrMax);
    const fs       = safeNum(s.fightScorePeak);

    totalPunches += punches;
    if (punches > maxPunchesInSession) maxPunchesInSession = punches;

    // Colpi max in un singolo round
    if (Array.isArray(s.punchesByRound)) {
      const rounds = s.punchesByRound.length;
      totalRounds += rounds;
      const roundMax = Math.max(0, ...s.punchesByRound.map(Number).filter(Number.isFinite));
      if (roundMax > maxPunchesInRound) maxPunchesInRound = roundMax;
    }

    if (type === "running") {
      totalRunningSessions++;
      totalRunningKm += km;
      if (km > maxRunningKm) maxRunningKm = km;
    } else {
      totalWorkoutSessions++;
    }

    totalMinutes += Math.max(0, dur);
    if (avgHr > maxHrSeen) maxHrSeen = avgHr;
    if (fs > maxFightScore) maxFightScore = fs;

    const dk = toDateKey(s.date || s.createdAt);
    if (dk) daySet.add(dk);
  }

  // ── Streak ───────────────────────────────────────────────
  const sortedDays = [...daySet].sort();
  let currentStreak = 0;
  let longestStreak = 0;

  if (sortedDays.length > 0) {
    // Streak corrente: conta all'indietro da oggi
    const todayKey = toDateKey(new Date().toISOString());
    const yestKey  = toDateKey(new Date(Date.now() - 86400000).toISOString());

    // Lo streak è "vivo" se c'è una sessione oggi o ieri
    const lastDay = sortedDays[sortedDays.length - 1];
    if (lastDay === todayKey || lastDay === yestKey) {
      currentStreak = 1;
      for (let i = sortedDays.length - 2; i >= 0; i--) {
        const d1 = new Date(sortedDays[i]);
        const d2 = new Date(sortedDays[i + 1]);
        const diffDays = Math.round((d2 - d1) / 86400000);
        if (diffDays === 1) currentStreak++;
        else break;
      }
    }

    // Streak più lungo in assoluto
    let run = 1;
    for (let i = 1; i < sortedDays.length; i++) {
      const d1 = new Date(sortedDays[i - 1]);
      const d2 = new Date(sortedDays[i]);
      const diff = Math.round((d2 - d1) / 86400000);
      if (diff === 1) { run++; if (run > longestStreak) longestStreak = run; }
      else run = 1;
    }
    longestStreak = Math.max(longestStreak, run, currentStreak);
  }

  // ── VO2max ───────────────────────────────────────────────
  const vo2Values = vo2.map(v => safeNum(v.value)).filter(v => v > 0);
  const maxVo2    = vo2Values.length > 0 ? Math.max(...vo2Values) : 0;
  const latestVo2 = vo2Values.length > 0 ? safeNum(vo2[vo2.length - 1].value) : 0;

  return {
    totalPunches:        Math.round(totalPunches),
    maxPunchesInSession: Math.round(maxPunchesInSession),
    maxPunchesInRound:   Math.round(maxPunchesInRound),
    totalRunningKm:      parseFloat(totalRunningKm.toFixed(1)),
    maxRunningKm:        parseFloat(maxRunningKm.toFixed(1)),
    totalRounds,
    totalSessions,
    totalWorkoutSessions,
    totalRunningSessions,
    totalMinutes:        Math.round(totalMinutes),
    maxHrSeen:           Math.round(maxHrSeen),
    maxFightScore:       Math.round(maxFightScore),
    currentStreak,
    longestStreak,
    maxVo2:              parseFloat(maxVo2.toFixed(1)),
    latestVo2:           parseFloat(latestVo2.toFixed(1)),
    activeDays:          sortedDays.length,
  };
}

// ─────────────────────────────────────────────────────────
// DEFINIZIONE BADGE
// ─────────────────────────────────────────────────────────
// Ogni badge ha:
//   id       - chiave unica
//   category - raggruppamento UI
//   icon     - emoji (compatibile RN, no SVG necessario)
//   label    - nome breve
//   desc     - descrizione
//   check(stats) → { unlocked: bool, progress: 0-1, progressLabel: string }

export const BADGE_DEFINITIONS = [

  // ─── COLPI ─────────────────────────────────────────────
  {
    id: "punches_500",
    category: "punches",
    icon: "🥊",
    labelFallback: "Primo Sangue",
    descFallback: "500 colpi totali",
    tier: 1,
    check: (s) => ({
      unlocked: s.totalPunches >= 500,
      progress: Math.min(1, s.totalPunches / 500),
      progressLabel: `${s.totalPunches.toLocaleString()} / 500`,
    }),
  },
  {
    id: "punches_5k",
    category: "punches",
    icon: "🥊",
    labelFallback: "Ganci di Ferro",
    descFallback: "5.000 colpi totali",
    tier: 2,
    check: (s) => ({
      unlocked: s.totalPunches >= 5000,
      progress: Math.min(1, s.totalPunches / 5000),
      progressLabel: `${s.totalPunches.toLocaleString()} / 5.000`,
    }),
  },
  {
    id: "punches_10k",
    category: "punches",
    icon: "🥊",
    labelFallback: "Machine Gun",
    descFallback: "10.000 colpi totali",
    tier: 3,
    check: (s) => ({
      unlocked: s.totalPunches >= 10000,
      progress: Math.min(1, s.totalPunches / 10000),
      progressLabel: `${s.totalPunches.toLocaleString()} / 10.000`,
    }),
  },
  {
    id: "punches_50k",
    category: "punches",
    icon: "💀",
    labelFallback: "Iron Mike",
    descFallback: "50.000 colpi totali",
    tier: 4,
    check: (s) => ({
      unlocked: s.totalPunches >= 50000,
      progress: Math.min(1, s.totalPunches / 50000),
      progressLabel: `${s.totalPunches.toLocaleString()} / 50.000`,
    }),
  },
  {
    id: "punches_round_100",
    category: "punches",
    icon: "⚡",
    labelFallback: "Esplosione",
    descFallback: "100 colpi in un singolo round",
    tier: 3,
    check: (s) => ({
      unlocked: s.maxPunchesInRound >= 100,
      progress: Math.min(1, s.maxPunchesInRound / 100),
      progressLabel: (t("badges.progress.recordRound", { n: s.maxPunchesInRound }) || `Record round: ${s.maxPunchesInRound}`),
    }),
  },

  // ─── STREAK ────────────────────────────────────────────
  {
    id: "streak_3",
    category: "streak",
    icon: "🔥",
    labelFallback: "Sul Fuoco",
    descFallback: "3 giorni consecutivi",
    tier: 1,
    check: (s) => ({
      unlocked: s.longestStreak >= 3,
      progress: Math.min(1, s.currentStreak / 3),
      progressLabel: (t("badges.progress.currentStreak", { n: s.currentStreak }) || `Streak attuale: ${s.currentStreak} gg`),
    }),
  },
  {
    id: "streak_7",
    category: "streak",
    icon: "🔥",
    labelFallback: "Settimana di Fuoco",
    descFallback: "7 giorni consecutivi",
    tier: 2,
    check: (s) => ({
      unlocked: s.longestStreak >= 7,
      progress: Math.min(1, s.currentStreak / 7),
      progressLabel: (t("badges.progress.currentStreak", { n: s.currentStreak }) || `Streak attuale: ${s.currentStreak} gg`),
    }),
  },
  {
    id: "streak_30",
    category: "streak",
    icon: "🌋",
    labelFallback: "Mese Infuocato",
    descFallback: "30 giorni consecutivi",
    tier: 3,
    check: (s) => ({
      unlocked: s.longestStreak >= 30,
      progress: Math.min(1, s.currentStreak / 30),
      progressLabel: (t("badges.progress.currentStreak", { n: s.currentStreak }) || `Streak attuale: ${s.currentStreak} gg`),
    }),
  },
  {
    id: "streak_100",
    category: "streak",
    icon: "👹",
    labelFallback: "Demone",
    descFallback: "100 giorni consecutivi",
    tier: 4,
    check: (s) => ({
      unlocked: s.longestStreak >= 100,
      progress: Math.min(1, s.currentStreak / 100),
      progressLabel: (t("badges.progress.currentStreak", { n: s.currentStreak }) || `Streak attuale: ${s.currentStreak} gg`),
    }),
  },

  // ─── VO2MAX ─────────────────────────────────────────────
  {
    id: "vo2_45",
    category: "vo2",
    icon: "💨",
    labelFallback: "Fiato Atletico",
    descFallback: "VO2max ≥ 45 ml/kg/min",
    tier: 2,
    check: (s) => ({
      unlocked: s.maxVo2 >= 45,
      progress: Math.min(1, s.maxVo2 / 45),
      progressLabel: (t("badges.progress.vo2Current", { n: s.maxVo2 }) || `VO2max: ${s.maxVo2} ml/kg/min`),
    }),
  },
  {
    id: "vo2_50",
    category: "vo2",
    icon: "🫁",
    labelFallback: "Motore da Gara",
    descFallback: "VO2max ≥ 50 ml/kg/min",
    tier: 3,
    check: (s) => ({
      unlocked: s.maxVo2 >= 50,
      progress: Math.min(1, s.maxVo2 / 50),
      progressLabel: (t("badges.progress.vo2Current", { n: s.maxVo2 }) || `VO2max: ${s.maxVo2} ml/kg/min`),
    }),
  },
  {
    id: "vo2_60",
    category: "vo2",
    icon: "🚀",
    labelFallback: "Élite",
    descFallback: "VO2max ≥ 60 ml/kg/min (livello professionista)",
    tier: 4,
    check: (s) => ({
      unlocked: s.maxVo2 >= 60,
      progress: Math.min(1, s.maxVo2 / 60),
      progressLabel: (t("badges.progress.vo2Current", { n: s.maxVo2 }) || `VO2max: ${s.maxVo2} ml/kg/min`),
    }),
  },

  // ─── SESSIONI / ROUND ───────────────────────────────────
  {
    id: "sessions_10",
    category: "sessions",
    icon: "🎯",
    labelFallback: "Inizio",
    descFallback: "10 sessioni completate",
    tier: 1,
    check: (s) => ({
      unlocked: s.totalSessions >= 10,
      progress: Math.min(1, s.totalSessions / 10),
      progressLabel: (t("badges.progress.ofSessions", { n: s.totalSessions, total: 10 }) || `${s.totalSessions} / 10 sessioni`),
    }),
  },
  {
    id: "sessions_50",
    category: "sessions",
    icon: "🎯",
    labelFallback: "Veterano",
    descFallback: "50 sessioni completate",
    tier: 2,
    check: (s) => ({
      unlocked: s.totalSessions >= 50,
      progress: Math.min(1, s.totalSessions / 50),
      progressLabel: (t("badges.progress.ofSessions", { n: s.totalSessions, total: 50 }) || `${s.totalSessions} / 50 sessioni`),
    }),
  },
  {
    id: "sessions_200",
    category: "sessions",
    icon: "🏆",
    labelFallback: "Campione",
    descFallback: "200 sessioni completate",
    tier: 3,
    check: (s) => ({
      unlocked: s.totalSessions >= 200,
      progress: Math.min(1, s.totalSessions / 200),
      progressLabel: (t("badges.progress.ofSessions", { n: s.totalSessions, total: 200 }) || `${s.totalSessions} / 200 sessioni`),
    }),
  },
  {
    id: "rounds_100",
    category: "sessions",
    icon: "⏱",
    labelFallback: "Cento Round",
    descFallback: "100 round completati",
    tier: 2,
    check: (s) => ({
      unlocked: s.totalRounds >= 100,
      progress: Math.min(1, s.totalRounds / 100),
      progressLabel: (t("badges.progress.ofRounds", { n: s.totalRounds, total: 100 }) || `${s.totalRounds} / 100 round`),
    }),
  },
  {
    id: "rounds_500",
    category: "sessions",
    icon: "⏱",
    labelFallback: "Il Ring è Casa Mia",
    descFallback: "500 round completati",
    tier: 3,
    check: (s) => ({
      unlocked: s.totalRounds >= 500,
      progress: Math.min(1, s.totalRounds / 500),
      progressLabel: (t("badges.progress.ofRounds", { n: s.totalRounds, total: 500 }) || `${s.totalRounds} / 500 round`),
    }),
  },
  {
    id: "time_1000min",
    category: "sessions",
    icon: "⌛",
    labelFallback: "Mille Minuti",
    descFallback: "1.000 minuti di allenamento totale",
    tier: 2,
    check: (s) => ({
      unlocked: s.totalMinutes >= 1000,
      progress: Math.min(1, s.totalMinutes / 1000),
      progressLabel: (t("badges.progress.ofMinutes", { n: s.totalMinutes.toLocaleString(), total: 1000 }) || `${s.totalMinutes.toLocaleString()} / 1.000 min`),
    }),
  },

  // ─── RUNNING ─────────────────────────────────────────────
  {
    id: "running_50km",
    category: "running",
    icon: "🏃",
    labelFallback: "Mezza Gara",
    descFallback: "50 km totali in corsa",
    tier: 2,
    check: (s) => ({
      unlocked: s.totalRunningKm >= 50,
      progress: Math.min(1, s.totalRunningKm / 50),
      progressLabel: (t("badges.progress.ofKm", { n: s.totalRunningKm.toFixed(1), total: 50 }) || `${s.totalRunningKm.toFixed(1)} / 50 km`),
    }),
  },
  {
    id: "running_100km",
    category: "running",
    icon: "🏅",
    labelFallback: "Cento Km",
    descFallback: "100 km totali in corsa",
    tier: 3,
    check: (s) => ({
      unlocked: s.totalRunningKm >= 100,
      progress: Math.min(1, s.totalRunningKm / 100),
      progressLabel: (t("badges.progress.ofKm", { n: s.totalRunningKm.toFixed(1), total: 100 }) || `${s.totalRunningKm.toFixed(1)} / 100 km`),
    }),
  },

  // ─── FIGHT SCORE ─────────────────────────────────────────
  {
    id: "fs_75",
    category: "score",
    icon: "⚡",
    labelFallback: "Fighter",
    descFallback: "Fight Score ≥ 75 in una sessione",
    tier: 2,
    check: (s) => ({
      unlocked: s.maxFightScore >= 75,
      progress: Math.min(1, s.maxFightScore / 75),
      progressLabel: (t("badges.progress.bestScore", { n: s.maxFightScore }) || `Miglior score: ${s.maxFightScore}`),
    }),
  },
  {
    id: "fs_90",
    category: "score",
    icon: "🔥",
    labelFallback: "Elite Fighter",
    descFallback: "Fight Score ≥ 90 in una sessione",
    tier: 3,
    check: (s) => ({
      unlocked: s.maxFightScore >= 90,
      progress: Math.min(1, s.maxFightScore / 90),
      progressLabel: (t("badges.progress.bestScore", { n: s.maxFightScore }) || `Miglior score: ${s.maxFightScore}`),
    }),
  },
];

// ─────────────────────────────────────────────────────────
// FUNZIONE PRINCIPALE
// ─────────────────────────────────────────────────────────

/**
 * Calcola stato di tutti i badge.
 * @returns {object[]} array di badge con { ...def, unlocked, progress, progressLabel }
 */
export function computeBadges(sessions, vo2Measurements) {
  const stats = computeStats(sessions, vo2Measurements);
  return BADGE_DEFINITIONS.map((def) => {
    const result = def.check(stats);
    return {
      ...def,
      label: t(`badges.items.${def.id}.label`) || def.labelFallback,
      desc: t(`badges.items.${def.id}.desc`) || def.descFallback,
      ...result,
    };
  });
}

