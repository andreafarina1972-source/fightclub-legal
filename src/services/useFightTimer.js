// src/services/useFightTimer.js
import { useEffect, useState, useRef } from "react";
import { Vibration } from "react-native";
import { playBeep, playCount1, playGong } from "./soundManager";

export default function useFightTimer(config) {
  const {
    prep = 10,
    round = 180,
    rest = 60,
    rounds = 3,
    cycles = 1,
    cycleRest = 120,
  } = config || {};

  // ===============================
  // ⏱ STATO TIMER
  // ===============================
  const [phase, setPhase] = useState("idle");
  const [seconds, setSeconds] = useState(prep);
  const [phaseDuration, setPhaseDuration] = useState(prep);

  const [roundIndex, setRoundIndex] = useState(1);
  const [cycleIndex, setCycleIndex] = useState(1);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [hasSessionData, setHasSessionData] = useState(false);

  // ===============================
  // 🥊 COLPI
  // ===============================
  const [punchCount, setPunchCount] = useState(0);
  const [punchesByRound, setPunchesByRound] = useState([]);
  const roundPunchesRef = useRef(0);

  const addPunch = () => {
    if (phase !== "round") return;
    setPunchCount((p) => p + 1);
    roundPunchesRef.current += 1;
  };

  const intervalRef = useRef(null);

  // ✅ Count1 SOLO una volta: countdown iniziale prima della 1ª ripresa
  const didPlayCount1Ref = useRef(false);

  const clear = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  // ===============================
  // ▶️ AVVIO FASI
  // ===============================
  const startPhase = (newPhase) => {
    setPhase(newPhase);

    if (newPhase === "prep") {
      setPhaseDuration(prep);
      setSeconds(prep);

      // reset flag all'avvio sessione
      didPlayCount1Ref.current = false;

      // beep iniziale
      playBeep();
      return;
    }

    if (newPhase === "round") {
      roundPunchesRef.current = 0;
      setPhaseDuration(round);
      setSeconds(round);

      // ✅ Inizio round: SOLO gong (anche dalla 2ª ripresa in poi)
      playGong();
      Vibration.vibrate(200);
      return;
    }

    if (newPhase === "rest") {
      setPhaseDuration(rest);
      setSeconds(rest);

      // ✅ Fine round (inizio riposo): SOLO gong
      playGong();
      Vibration.vibrate([0, 150, 100, 150]);
      return;
    }

    if (newPhase === "cycleRest") {
      setPhaseDuration(cycleRest);
      setSeconds(cycleRest);

      // ✅ Fine ciclo: gong
      playGong();
      return;
    }

    if (newPhase === "finish") {
      clear();
      setSeconds(0);
      setPhaseDuration(0);

      // fine sessione
      playBeep();
      Vibration.vibrate([0, 300, 200, 300]);
      return;
    }
  };

  // ===============================
  // ▶️ START
  // ===============================
  const start = () => {
    clear();
    setHasSessionData(true);

    setRoundIndex(1);
    setCycleIndex(1);

    setPunchCount(0);
    setPunchesByRound([]);
    roundPunchesRef.current = 0;

    setElapsedSeconds(0);

    if (prep > 0) startPhase("prep");
    else startPhase("round");
  };

  // ===============================
  // ⏹ STOP (NON resetto i dati)
  // ===============================
  const stop = () => {
    clear();
    setPhase("idle");
    setSeconds(0);
    setPhaseDuration(0);
  };

  // ✅ RESET completo (se serve)
  const reset = () => {
    clear();
    setPhase("idle");
    setSeconds(prep);
    setPhaseDuration(prep);

    setRoundIndex(1);
    setCycleIndex(1);

    setPunchCount(0);
    setPunchesByRound([]);
    roundPunchesRef.current = 0;

    setElapsedSeconds(0);
    setHasSessionData(false);

    didPlayCount1Ref.current = false;
  };

  // ===============================
  // ⏳ COUNTDOWN
  // ===============================
  const handleAdvancedCountdown = () => {
    if (seconds <= 0) return;

    // beep ultimi 10s (ma durante il prep iniziale, quando parte Count1, evitiamo “casino”)
    const isFirstPrep = phase === "prep" && cycleIndex === 1 && roundIndex === 1;

    if (!isFirstPrep) {
      if (seconds <= 10 && seconds > 3) {
        playBeep();
        Vibration.vibrate(40);
      }
    }

    // ✅ Count1 (10s) SOLO nel PREP iniziale, quando mancano 10 secondi
    if (isFirstPrep && seconds === 10 && !didPlayCount1Ref.current) {
      didPlayCount1Ref.current = true;
      playCount1();
    }
  };

  // ===============================
  // ⏲ TIMER LOOP (✅ incrementa elapsed)
  // ===============================
  useEffect(() => {
    if (phase === "idle" || phase === "finish") return;

    clear();
    intervalRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s <= 0) return 0;
        setElapsedSeconds((e) => e + 1);
        return Math.max(0, s - 1);
      });
    }, 1000);

    return clear;
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ===============================
  // 🔁 CAMBIO FASI
  // ===============================
  useEffect(() => {
    if (seconds > 0) {
      handleAdvancedCountdown();
      return;
    }

    if (phase === "prep") {
      startPhase("round");
      return;
    }

    if (phase === "round") {
      setPunchesByRound((prev) => [...prev, roundPunchesRef.current]);

      if (roundIndex < rounds) {
        setRoundIndex((r) => r + 1);
        startPhase("rest");
      } else {
        if (cycleIndex < cycles) {
          setCycleIndex((c) => c + 1);
          setRoundIndex(1);
          startPhase("cycleRest");
        } else {
          startPhase("finish");
        }
      }
      return;
    }

    if (phase === "rest") startPhase("round");
    if (phase === "cycleRest") startPhase("round");
  }, [seconds]); // eslint-disable-line react-hooks/exhaustive-deps

  // ===============================
  // 🔵 PROGRESS
  // ===============================
  const progress =
    phase === "idle" || phase === "finish" || phaseDuration === 0 ? 0 : seconds / phaseDuration;

  return {
    phase,
    seconds,
    progress,

    round: roundIndex,
    cycle: cycleIndex,
    totalRounds: rounds,

    start,
    stop,
    reset,

    finished: phase === "finish",

    punchCount,
    punchesByRound,
    addPunch,

    elapsedSeconds,
    hasSessionData,
  };
}
