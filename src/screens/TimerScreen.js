// src/screens/TimerScreen.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Pressable,
  ScrollView,
  Alert,
} from "react-native";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";

import { Svg, Circle } from "react-native-svg";
import { speakRoundStart } from "../services/voiceCoach";
import { useFightScore } from "../services/fightScore";
import FightScoreBadge from "../components/FightScoreBadge";
import { speakCornermanFeedback } from "../services/cornermanAI";
import { loadSounds } from "../services/soundManager";
import { t } from "../i18n";

import useFightTimer from "../services/useFightTimer";
import { startPunchDetection, stopPunchDetection } from "../services/punchDetector";

import { useHistoryData } from "../context/HistoryContext";
import { estimateCaloriesFromSession } from "../services/vo2Utils";

import { connectHeartRate, subscribeHeartRate } from "../services/heartRateService";

import PunchesBarChart from "../components/charts/PunchesBarChart";
import CardioZonesChart from "../components/CardioZonesChart";
import {
  getHrMax,
  zonesMeta,
  trainingZonesMeta,
  initZonesAccumulator,
  accumulateZones,
} from "../services/hrZones";

const RADIUS = 110;
const STROKE = 10;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const formatTime = (sec) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const sumArr = (arr) =>
  (Array.isArray(arr) ? arr : []).reduce((a, b) => a + (Number(b) || 0), 0);

export default function TimerScreen({ route }) {
  const workout = route?.params?.workout || {};

  const config = {
    prep: workout.prep ?? 10,
    round: workout.round ?? 180,
    rest: workout.rest ?? 60,
    rounds: workout.rounds ?? 3,
    cycles: workout.cycles ?? 1,
    cycleRest: workout.cycleRest ?? 120,
    name: workout.name ?? t("timerScreen.workoutDefault"),
  };

  const {
    seconds,
    phase,
    round,
    cycle,
    start,
    stop,
    progress,
    finished,
    punchCount,
    punchesByRound,
    addPunch,
  } = useFightTimer(config);

  const isRest = String(phase || "").toLowerCase() === "rest";
  const progressColor = isRest ? "#E33535" : "#37E293";
  const getPhaseLabel = useCallback(
    (p) => {
      const key = String(p || "").toLowerCase();
      // Reuse existing i18n keys from quickTimer where possible
      if (key === "round") return t("quickTimer.work");
      if (key === "rest") return t("quickTimer.rest");
      if (key === "prep") return t("quickTimer.ready");
      if (key === "cyclerest") return t("quickTimer.rest");
      if (key === "finish") return t("quickTimer.done");
      if (key === "idle") return "";
      return String(p || "").toUpperCase();
    },
    []  // dummy dep not used; keep stable enough
  );


  const { addSession } = useHistoryData();

  const [hr, setHr] = useState(null);
  const hrRef = useRef(null);
  // Cornerman AI: traccia picco e media HR per round
  const hrPeakRef = useRef(null);   // HR massima nel round corrente
  const hrSumRef  = useRef(0);      // somma HR per calcolo media
  const hrSamplesRef = useRef(0);   // numero campioni HR
  useEffect(() => {
    hrRef.current = hr;
    if (hr != null && Number.isFinite(hr)) {
      // aggiorna picco solo durante il round
      if (hrPeakRef.current == null || hr > hrPeakRef.current) {
        hrPeakRef.current = hr;
      }
      hrSumRef.current += hr;
      hrSamplesRef.current += 1;
    }
  }, [hr]);

  const [hrStatus, setHrStatus] = useState("disconnected");

  const [hrMax, setHrMaxState] = useState(190);
  const hrMaxRef = useRef(190);
  useEffect(() => {
    hrMaxRef.current = hrMax;
  }, [hrMax]);

  const lastAnnouncedRoundRef = useRef(null);
  useEffect(() => {
    if (phase === "idle") {
      lastAnnouncedRoundRef.current = null;
      return;
    }
    if (String(phase || "").toLowerCase() === "round" && Number.isFinite(round)) {
      if (lastAnnouncedRoundRef.current !== round) {
        lastAnnouncedRoundRef.current = round;
        speakRoundStart(round);
        // reset HR stats per il nuovo round
        hrPeakRef.current = null;
        hrSumRef.current = 0;
        hrSamplesRef.current = 0;
      }
    }
  }, [phase, round]);

  // Cornerman AI: feedback vocale all'inizio della pausa (subito dopo il round)
  const lastCornermanRoundRef = useRef(null);
  useEffect(() => {
    const isResting =
      String(phase || "").toLowerCase() === "rest" ||
      String(phase || "").toLowerCase() === "cyclerest" ||
      String(phase || "").toLowerCase() === "finish";

    if (!isResting) return;
    // evita di ripetere il feedback per lo stesso round
    if (lastCornermanRoundRef.current === round) return;
    lastCornermanRoundRef.current = round;

    const punchesThisRound =
      Array.isArray(punchesByRound) && punchesByRound.length > 0
        ? punchesByRound[punchesByRound.length - 1]
        : 0;

    const hrAvg =
      hrSamplesRef.current > 0
        ? Math.round(hrSumRef.current / hrSamplesRef.current)
        : null;

    speakCornermanFeedback({
      roundNumber:      round,
      totalRounds:      config.rounds,
      punchesThisRound: punchesThisRound,
      punchesTotal:     punchCount,
      hrPeak:           hrPeakRef.current,
      hrAvg:            hrAvg,
      hrMax:            hrMax,
      roundSeconds:     config.round,
      isLastRound:      String(phase || "").toLowerCase() === "finish",
    });
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const isRunning = phase !== "idle" && phase !== "finish";
    if (isRunning) {
      activateKeepAwakeAsync();
    } else {
      deactivateKeepAwake();
    }
    return () => {
      deactivateKeepAwake();
    };
  }, [phase]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const v = await getHrMax();
        if (alive) setHrMaxState(v);
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const unsub = subscribeHeartRate((bpm) => {
      if (!alive) return;
      setHr(bpm);
      setHrStatus("connected");
    });
    return () => {
      alive = false;
      unsub?.();
    };
  }, []);

  useEffect(() => {
    if (String(phase || "").toLowerCase() === "round") startPunchDetection(addPunch);
    else stopPunchDetection();
  }, [phase, addPunch]);

  const zonesRef = useRef(initZonesAccumulator());
  const [zonesLive, setZonesLive] = useState(zonesRef.current);
  const sampleIntervalRef = useRef(null);

  const stopSampling = useCallback(() => {
    if (sampleIntervalRef.current) {
      clearInterval(sampleIntervalRef.current);
      sampleIntervalRef.current = null;
    }
  }, []);

  const startSampling = useCallback(() => {
    stopSampling();
    sampleIntervalRef.current = setInterval(() => {
      const bpm = hrRef.current;
      accumulateZones(zonesRef.current, bpm, hrMaxRef.current);
      setZonesLive({
        elapsed: zonesRef.current.elapsed,
        metabolic: { ...zonesRef.current.metabolic },
        training: { ...zonesRef.current.training },
      });
    }, 1000);
  }, [stopSampling]);

  useEffect(() => {
    return () => {
      stopSampling();
      stopPunchDetection();
    };
  }, [stopSampling]);

  const resetZones = useCallback(() => {
    zonesRef.current = initZonesAccumulator();
    setZonesLive(zonesRef.current);
  }, []);

  // 🔊 sounds pre-load (evita gong muto su Android)
  const soundsReadyRef = useRef(false);
  const soundsLoadingRef = useRef(null);
  const ensureSoundsReady = useCallback(async () => {
    if (soundsReadyRef.current) return;
    if (soundsLoadingRef.current) {
      await soundsLoadingRef.current;
      return;
    }
    soundsLoadingRef.current = (async () => {
      try {
        await loadSounds?.();
      } catch {}
      soundsReadyRef.current = true;
      soundsLoadingRef.current = null;
    })();
    await soundsLoadingRef.current;
  }, []);

  useEffect(() => {
    // preload suoni appena entri nella schermata
    ensureSoundsReady();
  }, [ensureSoundsReady]);

  const didSaveRef = useRef(false);
  useEffect(() => {
    if (!finished) return;
    if (didSaveRef.current) return;
    didSaveRef.current = true;

    stopSampling();
    stopPunchDetection();

    const totalSeconds =
      config.prep +
      config.round * config.rounds * config.cycles +
      config.rest * (config.rounds - 1) * config.cycles +
      config.cycleRest * (config.cycles - 1);

    const calories = estimateCaloriesFromSession(totalSeconds, 0);

    addSession({
      id: Date.now().toString(),
      workoutId: workout.id || null,
      workoutName: workout.name,
      date: new Date().toISOString(),
      totalMinutes: Math.round(totalSeconds / 60),
      totalSeconds,
      punches: punchCount,
      punchesByRound: Array.isArray(punchesByRound) ? punchesByRound : [],
      fightScorePeak: fightScore?.total ?? null,
      rounds: config.rounds,
      cycles: config.cycles,
      avgHr: hr ?? null,
      calories,
      hrZones: {
        hrMax: hrMaxRef.current,
        elapsed: zonesRef.current.elapsed,
        metabolic: { ...zonesRef.current.metabolic },
        training: { ...zonesRef.current.training },
      },
    });
  }, [
    finished,
    addSession,
    config,
    workout,
    punchCount,
    punchesByRound,
    hr,
    stopSampling,
  ]);

  let barColor = "#222";

// ✅ evidenzia gli ultimi 10s SOLO all'inizio del primo round (Round 1, Cycle 1)
const isFirstRound = Number(round) === 1 && Number(cycle) === 1;
if (String(phase || "").toLowerCase() === "round" && isFirstRound && seconds <= 10 && seconds > 0) {
  barColor = "#F6B100";
} else {
  if (phase === "prep") barColor = "#2D6CDF";
  if (phase === "round") barColor = "#0DE35A";
  if (phase === "rest") barColor = "#E33535";
  if (phase === "cycleRest") barColor = "#B45CFF";
  if (phase === "finish") barColor = "#37E293";
}

  const strokeDashoffset = CIRCUMFERENCE * (1 - progress);

  const handleStart = useCallback(async () => {
    if (phase !== "idle") return;

    didSaveRef.current = false;
    resetZones();

    await ensureSoundsReady();

    start();
    startSampling();

    try {
      setHrStatus("scanning");
      await connectHeartRate();
    } catch {
      setHrStatus("disconnected");
    }
  }, [phase, resetZones, start, startSampling]);

  const handleStop = useCallback(() => {
    if (phase === "idle") return;

    const doneRounds = Array.isArray(punchesByRound) ? punchesByRound : [];
    const doneSum = sumArr(doneRounds);
    const currentRoundPunches = Math.max(0, (Number(punchCount) || 0) - doneSum);

    const punchesByRoundSnapshot =
      phase === "round" && currentRoundPunches > 0
        ? [...doneRounds, currentRoundPunches]
        : [...doneRounds];

    const snapshot = {
      punches: punchCount,
      punchesByRound: punchesByRoundSnapshot,
      avgHr: hr ?? null,
      elapsed: zonesRef.current.elapsed,
      zones: {
        hrMax: hrMaxRef.current,
        metabolic: { ...zonesRef.current.metabolic },
        training: { ...zonesRef.current.training },
      },
    };

    stopSampling();
    stopPunchDetection();
    stop();
    setHrStatus("disconnected");

    Alert.alert(t("timerScreen.interruptedTitle"), t("timerScreen.interruptedBody"), [
      { text: t("common.no"), style: "cancel" },
      {
        text: t("common.save"),
        style: "default",
        onPress: () => {
          const totalSeconds = Math.max(1, snapshot.elapsed || 0);
          const calories = estimateCaloriesFromSession(totalSeconds, 0);

          addSession({
            id: Date.now().toString(),
            workoutId: workout.id || null,
            workoutName: workout.name
              ? t("timerScreen.workoutInterrupted", { name: workout.name })
              : t("timerScreen.workoutInterrupted", {
                  name: t("timerScreen.workoutDefault"),
                }),
            date: new Date().toISOString(),
            totalMinutes: Math.round(totalSeconds / 60),
            totalSeconds,

            punches: snapshot.punches,
            punchesByRound: snapshot.punchesByRound,
            rounds: config.rounds,
            cycles: config.cycles,

            avgHr: snapshot.avgHr,
            calories,
            interrupted: true,
            hrZones: {
              hrMax: snapshot.zones.hrMax,
              elapsed: snapshot.elapsed,
              metabolic: snapshot.zones.metabolic,
              training: snapshot.zones.training,
            },
          });
        },
      },
    ]);
  }, [
    phase,
    punchCount,
    punchesByRound,
    hr,
    stopSampling,
    stop,
    addSession,
    workout,
    config.rounds,
    config.cycles,
  ]);

  const metZones = useMemo(() => zonesMeta(zonesLive.metabolic), [zonesLive]);
  const trainZones = useMemo(() => trainingZonesMeta(zonesLive.training), [zonesLive]);

  // Fight Score live
  const fightScore = useFightScore({
    phase,
    hrBpm: hr,
    hrMax,
    punchCount,
    punchesByRound,
    roundSeconds: config.round,
    seconds,
  });

  // ✅ i18n labels for zone legends (keeps backward-compat if labelKey is missing)
  const metZonesI18n = useMemo(
    () => (metZones || []).map(z => ({ ...z, label: z?.labelKey ? (t(z.labelKey) || z.label) : z.label })),
    [metZones]
  );
  const trainZonesI18n = useMemo(
    () => (trainZones || []).map(z => ({ ...z, label: z?.labelKey ? (t(z.labelKey) || z.label) : z.label })),
    [trainZones]
  );


  const subTitleText = t("timerScreen.cycleRound", {
    cycle,
    cycles: config.cycles,
    round,
    rounds: config.rounds,
  });

  const hrStatusText =
    hrStatus === "connected"
      ? t("home.hrConnectedDot")
      : hrStatus === "scanning"
      ? t("home.hrScanningDot")
      : t("home.hrOffDot");

  return (
    <SafeAreaView style={styles.safe}>
      <View style={[styles.phaseBar, { backgroundColor: barColor }]} />

      {/* ✅ wrapper flex:1 per avere Scroll + footer fisso */}
      <View style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll}>
          <Text style={styles.title}>{config.name}</Text>
          <Text style={styles.subTitle}>{subTitleText}</Text>

          {/* CERCHIO */}
          <View style={styles.timerWrap}>
            <Svg width="260" height="260">
              <Circle cx="130" cy="130" r={RADIUS} stroke="#333" strokeWidth={STROKE} fill="none" />
              <Circle
                cx="130"
                cy="130"
                r={RADIUS}
                stroke={progressColor}
                strokeWidth={STROKE}
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="none"
              />
            </Svg>

            <Text style={styles.timerText}>{formatTime(seconds)}</Text>

            <Text style={[styles.phaseText, isRest && styles.phaseTextRest]}>
              {getPhaseLabel(phase)}
            </Text>
          </View>

          {/* ✅ SOTTO IL CERCHIO: COLPI */}
          <Text style={styles.punchesText}>{t("timerScreen.punches", { n: punchCount })}</Text>

          {/* FIGHT SCORE BADGE */}
          <FightScoreBadge scoreData={fightScore} phase={phase} />

          {/* resto UI */}
          <Text style={styles.hrText}>
            {t("timerScreen.hrLine", { hr: hr ? `${hr} bpm` : "--" })}{" "}
            <Text style={styles.hrStatus}>{hrStatusText}</Text>
          </Text>

          {zonesLive.elapsed > 5 && (
            <View style={{ width: "100%" }}>
              <CardioZonesChart
                title={t("timerScreen.metabolicTitle", { hrMax })}
                zones={metZonesI18n}
                totalSeconds={zonesLive.elapsed}
              />
              <CardioZonesChart
                title={t("timerScreen.trainingTitle")}
                zones={trainZonesI18n}
                totalSeconds={zonesLive.elapsed}
              />
            </View>
          )}

          {punchesByRound?.length > 0 && <PunchesBarChart data={punchesByRound} />}
        </ScrollView>

        {/* ✅ START/STOP FISSI (FUORI DALLA SCROLLVIEW) */}
        <View style={styles.controlsBar}>
          <Pressable style={[styles.btn, styles.startBtn]} onPress={handleStart}>
            <Text style={styles.startText}>{t("start")}</Text>
          </Pressable>

          <Pressable style={[styles.btn, styles.stopBtn]} onPress={handleStop}>
            <Text style={styles.stopText}>{t("stop")}</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#050508" },
  phaseBar: { height: 10, width: "100%" },

  // ✅ aggiunto paddingBottom per lasciare spazio sotto al contenuto (sotto c’è la barra fissa)
  scroll: { flexGrow: 1, padding: 20, alignItems: "center", paddingBottom: 140 },

  title: { color: "#fff", fontSize: 22, fontWeight: "700", marginBottom: 6 },

  subTitle: { color: "#aaa", fontSize: 16, fontWeight: "600", marginBottom: 20 },

  timerWrap: {
    width: 260,
    height: 260,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  timerText: { position: "absolute", color: "#fff", fontSize: 46, fontWeight: "800" },

  phaseText: { position: "absolute", marginTop: 78, color: "#37E293", fontSize: 18, fontWeight: "700" },
  phaseTextRest: { color: "#E33535", fontSize: 26, fontWeight: "900" },

  punchesText: {
    color: "#37E293",
    fontSize: 20,
    fontWeight: "800",
    marginTop: 6,
    marginBottom: 10,
  },

  // ✅ nuova barra fissa (stile uguale, ma non scorre)
  controlsBar: {
    flexDirection: "row",
    width: "100%",
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#222",
    backgroundColor: "#08080d",
  },

  btn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    marginHorizontal: 6,
    alignItems: "center",
  },
  startBtn: { backgroundColor: "#37E293" },
  stopBtn: { backgroundColor: "#444" },
  startText: { color: "#000", fontSize: 18, fontWeight: "800" },
  stopText: { color: "#fff", fontSize: 18, fontWeight: "800" },

  hrText: { color: "#fff", fontSize: 16, fontWeight: "600", marginTop: 10 },
  hrStatus: { color: "#777", fontWeight: "500" },
});