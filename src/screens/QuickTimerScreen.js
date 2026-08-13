// src/screens/QuickTimerScreen.js
import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Vibration,
  Alert,
  ScrollView,
} from "react-native";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";

import { Ionicons } from "@expo/vector-icons";
import { Svg, Circle } from "react-native-svg";

import GarminHeader from "../components/GarminHeader";
import { speakRoundStart } from "../services/voiceCoach";
import { calcFightScore } from "../services/fightScore";
import FightScoreBadge from "../components/FightScoreBadge";
import ProGate from "../components/ProGate";

// ✅ SOLO gong: inizio/fine round (niente Count1)
import { playGong, loadSounds } from "../services/soundManager";

import { startPunchDetection, stopPunchDetection } from "../services/punchDetector";
import { useHistoryData } from "../context/HistoryContext";
import { estimateCaloriesFromSession } from "../services/vo2Utils";

// ✅ i18n
import { t } from "../i18n";

import { connectHeartRate, subscribeHeartRate } from "../services/heartRateService";

import CardioZonesChart from "../components/CardioZonesChart";
import {
  getHrMax,
  zonesMeta,
  trainingZonesMeta,
  initZonesAccumulator,
  accumulateZones,
} from "../services/hrZones";

// ⭐ PRESET TIMER
const PRESETS = [
  { label: "3:00 / 1:00", work: 180, rest: 60 },
  { label: "2:00 / 1:00", work: 120, rest: 60 },
  { label: "1:30 / 1:00", work: 90, rest: 60 },
  { label: "5:00 / 1:00", work: 300, rest: 60 },
  { label: "6:00 / 1:00", work: 360, rest: 60 },
  { label: "8:00 / 1:00", work: 480, rest: 60 },
];

// Cerchio progress (come TimerScreen)
const RADIUS = 110;
const STROKE = 10;
const SIZE = 260;
const CENTER = SIZE / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const formatTime = (sec) => {
  const s = Math.max(0, Number(sec) || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
};

export default function QuickTimerScreen() {
  const [selected, setSelected] = useState(PRESETS[0]);
  const [rounds, setRounds] = useState(3);

  const [phase, setPhase] = useState("ready"); // ready | work | rest | done
  const [remaining, setRemaining] = useState(selected.work);
  const [currentRound, setCurrentRound] = useState(1);

  const isRest = phase === "rest";

  // 🥊 Colpi
  const [roundPunches, setRoundPunches] = useState(0);
  const [totalPunches, setTotalPunches] = useState(0);
  // ✅ FIX: traccia i colpi per round (mancava del tutto — "Colpi/round" nello storico
  // veniva calcolato dividendo il totale per 1, gonfiando enormemente lo score).
  // Ref (non state) per evitare closure stale nel setInterval di runTimer.
  const roundPunchesRef = useRef(0);
  const punchesByRoundRef = useRef([]);

  // 🔥 Intensità → colpi/minuto (CPM)
  const [liveIntensity, setLiveIntensity] = useState(0);
  const punchWindow = useRef([]); // ultimi 10 secondi

  const intervalRef = useRef(null);

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
  const { addSession } = useHistoryData();

  // anti stale state
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    setRemaining(selected.work);
  }, [selected]);

  useEffect(() => {
    // preload suoni appena entri nella schermata
    ensureSoundsReady();
  }, [ensureSoundsReady]);

  useEffect(() => {
  const isRunning = phase === "work" || phase === "rest";
  if (isRunning) {
    activateKeepAwakeAsync();
  } else {
    deactivateKeepAwake();
  }
  return () => {
    deactivateKeepAwake();
  };
}, [phase]);

  // -------------------
  // ❤️ HR + zones
  // -------------------
  const [hr, setHr] = useState(null);
  const hrRef = useRef(null);
  useEffect(() => {
    hrRef.current = hr;
  }, [hr]);

  const [hrStatus, setHrStatus] = useState("disconnected"); // disconnected | scanning | connected

  const [hrMax, setHrMaxState] = useState(190);
  const hrMaxRef = useRef(190);
  useEffect(() => {
    hrMaxRef.current = hrMax;
  }, [hrMax]);

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

    (async () => {
      try {
        setHrStatus("scanning");
        await connectHeartRate();
      } catch {
        if (!alive) return;
        setHrStatus("disconnected");
      }
    })();

    return () => {
      alive = false;
      unsub?.();
    };
  }, []);

  // Campionamento zone 1Hz
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

  const resetZones = useCallback(() => {
    zonesRef.current = initZonesAccumulator();
    setZonesLive(zonesRef.current);
  }, []);

  // ============================================================
  // ⭐ REGISTRA UN COLPO
  // ============================================================
  const registerPunch = useCallback(() => {
    if (phaseRef.current !== "work") return;

    const now = Date.now();
    punchWindow.current.push(now);
    punchWindow.current = punchWindow.current.filter((t) => now - t <= 10000);

    const cpm = punchWindow.current.length * 6;
    setLiveIntensity(cpm);

    setRoundPunches((p) => p + 1);
    setTotalPunches((tp) => tp + 1);
    roundPunchesRef.current += 1;
  }, []);

  // Punch detector: avvia in work. Nota: se passi da work→work (rest=0) l’effetto su "phase" non scatta,
  // quindi includiamo currentRound per riavviare il detector ad ogni nuovo round.
  useEffect(() => {
    if (phase === "work") startPunchDetection(registerPunch);
    else stopPunchDetection();
  }, [phase, currentRound, registerPunch]);

  // cleanup globale
  useEffect(() => {
    return () => {
      clearInterval(intervalRef.current);
      stopPunchDetection();
      stopSampling();
    };
  }, [stopSampling]);

  // ============================================================
  // LOOP TIMER
  // ============================================================
  const runTimer = (phaseType, duration, round) => {
    clearInterval(intervalRef.current);

    let timeLeft = duration;
    phaseRef.current = phaseType;
    setPhase(phaseType);
    setRemaining(timeLeft);

    intervalRef.current = setInterval(() => {
      timeLeft -= 1;

      if (timeLeft <= 0) {
        clearInterval(intervalRef.current);

        if (phaseType === "work") {
          // ✅ fine ripresa: SOLO gong
          ensureSoundsReady().then(() => playGong()).catch(() => playGong());
          Vibration.vibrate([0, 150, 100, 150]);

          stopPunchDetection();

          if (selected.rest > 0 && round < rounds) {
            runTimer("rest", selected.rest, round);
          } else {
            void nextRound(round);
          }
        } else if (phaseType === "rest") {
          punchWindow.current = [];
          setLiveIntensity(0);
          void nextRound(round);
        }
      } else {
        setRemaining(timeLeft);
      }
    }, 1000);
  };

  const nextRound = async (round) => {
    // ✅ salva i colpi del round appena concluso PRIMA di decidere se continuare o
    // terminare, così anche l'ultimo round finisce nell'array (via ref: sempre
    // aggiornato, a differenza dello state "roundPunches" che qui sarebbe stale).
    punchesByRoundRef.current = [...punchesByRoundRef.current, roundPunchesRef.current];
    roundPunchesRef.current = 0;

    const next = round + 1;

    if (next > rounds) {
      finishSession();
      return;
    }

    setCurrentRound(next);

    setRoundPunches(0);

    // ✅ inizio round: SOLO gong
    await ensureSoundsReady();
    playGong();
    Vibration.vibrate(200);

    speakRoundStart(next);

    runTimer("work", selected.work, next);
  };

  // START
  const start = async () => {
    if (phase === "work" || phase === "rest") return;

    resetZones();
    startSampling();

    setCurrentRound(1);
    setRoundPunches(0);
    setTotalPunches(0);
    roundPunchesRef.current = 0;
    punchesByRoundRef.current = [];
    punchWindow.current = [];
    setLiveIntensity(0);

    // ✅ inizio prima ripresa: SOLO gong
    await ensureSoundsReady();
    playGong();
    Vibration.vibrate(200);

    speakRoundStart(1);
    runTimer("work", selected.work, 1);
  };

  const finishSession = async () => {
    stopPunchDetection();
    stopSampling();

    phaseRef.current = "done";
    setPhase("done");
    setRemaining(0);

    // ✅ fine sessione: gong
    await ensureSoundsReady();
    playGong();
    Vibration.vibrate([0, 300, 200, 300]);

    const totalSeconds = zonesRef.current.elapsed || 0;
    const calories = estimateCaloriesFromSession(totalSeconds, 0);

    addSession({
      id: Date.now().toString(),
      // type esplicito (13/08/2026, BRIEF-srpe.md): descrive lo STRUMENTO
      // (timer libero — può scandire round ma anche circuiti, riscaldamento,
      // stretching: non un tipo di lavoro), non il contenuto. Nome distinto
      // da "rounds" (TimerScreen) apposta, per non suggerire una parentela
      // che non c'è. Lo storico esistente resta "workout" (legacy).
      type: "quick_timer",
      date: new Date().toISOString(),
      workoutId: null,
      workoutName: t("quickTimer.workoutName", { label: selected.label, rounds }),
      totalSeconds,
      totalMinutes: Math.round(totalSeconds / 60),
      avgHr: null,
      punches: totalPunches,
      punchesByRound: punchesByRoundRef.current,
      rounds,
      calories,
      fightScorePeak: fightScore?.total ?? null,
      hrZones: {
        hrMax: hrMaxRef.current,
        elapsed: zonesRef.current.elapsed,
        metabolic: { ...zonesRef.current.metabolic },
        training: { ...zonesRef.current.training },
      },
    });
  };

  // STOP con scelta
  const stop = () => {
    if (phase === "ready") return;

    // ✅ include il round in corso (fase "work") o appena concluso (fase "rest",
    // non ancora spostato nell'array da nextRound finché il riposo non termina)
    const pendingRoundPunches = roundPunchesRef.current;
    const punchesByRoundSnapshot =
      pendingRoundPunches > 0
        ? [...punchesByRoundRef.current, pendingRoundPunches]
        : [...punchesByRoundRef.current];

    const snapshot = {
      punches: totalPunches,
      punchesByRound: punchesByRoundSnapshot,
      elapsed: zonesRef.current.elapsed,
      zones: {
        hrMax: hrMaxRef.current,
        metabolic: { ...zonesRef.current.metabolic },
        training: { ...zonesRef.current.training },
      },
      label: selected.label,
      rounds,
    };

    clearInterval(intervalRef.current);
    stopPunchDetection();
    stopSampling();

    phaseRef.current = "ready";
    setPhase("ready");
    setRemaining(selected.work);
    setCurrentRound(1);
    setRoundPunches(0);
    setTotalPunches(0);
    roundPunchesRef.current = 0;
    punchesByRoundRef.current = [];
    punchWindow.current = [];
    setLiveIntensity(0);

    Alert.alert(t("quickTimer.interruptedTitle"), t("quickTimer.interruptedBody"), [
      { text: t("common.no"), style: "cancel" },
      {
        text: t("common.save"),
        onPress: () => {
          const totalSeconds = Math.max(1, snapshot.elapsed || 0);
          const calories = estimateCaloriesFromSession(totalSeconds, 0);

          addSession({
            id: Date.now().toString(),
            type: "quick_timer", // stesso strumento della sessione completata, vedi sopra
            date: new Date().toISOString(),
            workoutId: null,
            workoutName: t("quickTimer.workoutName", { label: snapshot.label, rounds: snapshot.rounds }),
            totalSeconds,
            totalMinutes: Math.round(totalSeconds / 60),
            avgHr: null,
            punches: snapshot.punches,
            punchesByRound: snapshot.punchesByRound,
            rounds: snapshot.rounds,
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
  };

  // UI helpers
  const adjustRounds = (delta) => {
    setRounds((prev) => Math.max(1, Math.min(20, prev + delta)));
  };

  const phaseLabel =
    phase === "work"
      ? t("quickTimer.work")
      : phase === "rest"
      ? t("quickTimer.rest")
      : phase === "done"
      ? t("quickTimer.done")
      : t("quickTimer.ready");

  const metZones = useMemo(() => zonesMeta(zonesLive.metabolic), [zonesLive]);
  const trainZones = useMemo(() => trainingZonesMeta(zonesLive.training), [zonesLive]);

  // Fight Score live
  // usa roundPunches (colpi SOLO del round corrente) non totalPunches
  const fightScore = useMemo(() => {
    const isRound = phase === "work";
    if (!isRound) {
      return { total: 0, hrScore: 0, paceScore: 0, constancyScore: 0,
               hrZone: null, ppm: 0, label: "IDLE" };
    }
    const elapsedInRound = Math.max(1,
      (Number(selected.work) || 180) - (Number(remaining) || 0)
    );
    return calcFightScore({
      hrBpm:          hr,
      hrMax:          Number(hrMax) || 190,
      punchesInRound: roundPunches,
      elapsedInRound,
    });
  }, [phase, hr, hrMax, roundPunches, remaining, selected.work]);

  // i18n-safe labels (fallback to original label if translation missing)
  const metZonesI18n = useMemo(
    () => (metZones || []).map(z => ({ ...z, label: z?.labelKey ? (t(z.labelKey) || z.label) : z.label })),
    [metZones]
  );
  const trainZonesI18n = useMemo(
    () => (trainZones || []).map(z => ({ ...z, label: z?.labelKey ? (t(z.labelKey) || z.label) : z.label })),
    [trainZones]
  );


  const badgeStatusText =
    hrStatus === "connected"
      ? t("home.hrConnectedDot")
      : hrStatus === "scanning"
      ? t("home.hrScanningDot")
      : t("home.hrOffDot");

  // ✅ progress cerchio: remaining / durata fase
  const phaseDuration =
    phase === "work" ? selected.work : phase === "rest" ? selected.rest : selected.work;

  const progress =
    phase === "done" || phaseDuration <= 0 ? 0 : Math.max(0, Math.min(1, remaining / phaseDuration));

  const strokeDashoffset = CIRCUMFERENCE * (1 - progress);
  const progressStrokeColor = isRest ? "#E33535" : "#37E293";

  return (
    <View style={styles.container}>
      <GarminHeader title={t("quickTimer.title")} subtitle={t("quickTimer.subtitle")} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        
<Text style={styles.sectionTitle}>{t("quickTimer.preset")}</Text>

        <View style={styles.presetRow}>
          {PRESETS.map((p) => (
            <TouchableOpacity
              key={p.label}
              style={[styles.presetBtn, selected.label === p.label && styles.presetBtnActive]}
              onPress={() => setSelected(p)}
            >
              <Text style={[styles.presetText, selected.label === p.label && styles.presetTextActive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.roundRow}>
          <Text style={styles.roundLabel}>{t("quickTimer.round")}</Text>

          <TouchableOpacity style={styles.roundControl} onPress={() => adjustRounds(-1)}>
            <Text style={styles.roundControlText}>-</Text>
          </TouchableOpacity>

          <Text style={styles.roundValue}>{rounds}</Text>

          <TouchableOpacity style={styles.roundControl} onPress={() => adjustRounds(1)}>
            <Text style={styles.roundControlText}>+</Text>
          </TouchableOpacity>
        </View>

        {/* ✅ scritta fase più grande (rossa in rest) */}
        <Text style={[styles.bigPhase, isRest && styles.bigPhaseRest]}>
          {phaseLabel.toUpperCase()}
        </Text>

        {/* ✅ CERCHIO PROGRESS come TimerScreen */}
        <View style={styles.timerWrap}>
          <Svg width={SIZE} height={SIZE}>
            <Circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              stroke="#333"
              strokeWidth={STROKE}
              fill="none"
            />
            <Circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              stroke={progressStrokeColor}
              strokeWidth={STROKE}
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="none"
              rotation="-90"
              origin={`${CENTER}, ${CENTER}`}
            />
          </Svg>

          <Text style={styles.timerText}>{formatTime(remaining)}</Text>
          <Text style={styles.timerSub}>{`${t("quickTimer.round").toUpperCase()} ${currentRound}/${rounds}`}</Text>
        </View>

        {/* HR BADGE */}
        <View style={styles.hrBadge}>
          <Ionicons name="heart-outline" size={16} color="#37E293" />
          <Text style={styles.hrBadgeText}>
            {hr ? `${hr} bpm` : "-- bpm"} <Text style={styles.hrBadgeSub}>{badgeStatusText}</Text>
          </Text>
        </View>

        <Text style={styles.punchCount}>{t("quickTimer.punchesRound", { n: roundPunches })}</Text>
        <Text style={styles.intensityLabel}>{t("quickTimer.intensity", { n: liveIntensity })}</Text>

        {/* FIGHT SCORE BADGE */}
        <ProGate
          title={t("fightScore.title") || "Fight Score"}
          teaser={<FightScoreBadge scoreData={fightScore} phase={phase === "work" ? "round" : phase} />}
        >
          <FightScoreBadge scoreData={fightScore} phase={phase === "work" ? "round" : phase} />
        </ProGate>

        {zonesLive.elapsed > 5 && (
          <View style={{ width: "100%" }}>
            <CardioZonesChart
              title={t("quickTimer.metabolicTitle", { hrMax })}
              zones={metZonesI18n}
              totalSeconds={zonesLive.elapsed}
            />
            <CardioZonesChart
              title={t("quickTimer.trainingTitle")}
              zones={trainZonesI18n}
              totalSeconds={zonesLive.elapsed}
            />
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      <View style={styles.controlsBar}>
        <TouchableOpacity style={[styles.controlBtn, styles.startBtn]} onPress={start}>
          <Text style={styles.controlText}>{t("start")}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.controlBtn, styles.stopBtn]} onPress={stop}>
          <Text style={styles.stopText}>{t("stop")}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  scrollContent: { padding: 16, paddingBottom: 10 },

  hrBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 10,
    backgroundColor: "#101018",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#2D2C33",
  },
  hrBadgeText: { color: "#37E293", marginLeft: 6, fontWeight: "800" },
  hrBadgeSub: { color: "#777", fontWeight: "600" },

  sectionTitle: { color: "#aaa", fontSize: 14, marginBottom: 8 },

  presetRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 16 },
  presetBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#333",
    marginRight: 8,
    marginBottom: 8,
  },
  presetBtnActive: { borderColor: "#37e293", backgroundColor: "#101f13" },
  presetText: { color: "#ccc", fontSize: 12 },
  presetTextActive: { color: "#37e293", fontWeight: "600" },

  roundRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  roundLabel: { color: "#aaa", fontSize: 14, flex: 1 },

  roundControl: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#444",
  },
  roundControlText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  roundValue: { color: "#fff", fontSize: 18, fontWeight: "700", marginHorizontal: 12 },

  // ✅ fase grande
  bigPhase: {
    textAlign: "center",
    color: "#37E293",
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 10,
  },
  bigPhaseRest: { color: "#E33535" },

  // ✅ cerchio timer
  timerWrap: {
    width: SIZE,
    height: SIZE,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 10,
  },
  timerText: {
    position: "absolute",
    color: "#fff",
    fontSize: 46,
    fontWeight: "900",
  },
  timerSub: {
    position: "absolute",
    marginTop: 78,
    color: "#aaa",
    fontSize: 14,
    fontWeight: "800",
  },

  punchCount: { color: "#37E293", fontSize: 16, fontWeight: "800", marginTop: 10 },
  intensityLabel: { color: "#aaa", fontSize: 14, marginTop: 4 },

  controlsBar: {
    flexDirection: "row",
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#222",
    backgroundColor: "#08080d",
  },
  controlBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginHorizontal: 6,
  },
  startBtn: { backgroundColor: "#37E293" },
  stopBtn: { backgroundColor: "#444" },
  controlText: { color: "#000", fontSize: 16, fontWeight: "900" },
  stopText: { color: "#fff", fontSize: 16, fontWeight: "900" },
});