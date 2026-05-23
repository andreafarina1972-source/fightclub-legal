import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Pressable,
} from "react-native";
import { Audio } from "expo-av";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ✅ i18n
import { t } from "../i18n";

const SILENCE_TIME = 5000; // 5 sec silenzio
const PUNCH_TIME = 10000; // 10 sec colpi

export default function PunchCalibrationScreen({ navigation }) {
  const [phase, setPhase] = useState("idle");
  const [seconds, setSeconds] = useState(0);
  const [info, setInfo] = useState("");

  const recordingRef = useRef(null);
  const samplesRef = useRef([]);

  // =========================
  // 🔊 AVVIO REGISTRAZIONE
  // =========================
  const startRecording = async () => {
    await Audio.requestPermissionsAsync();

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const recording = new Audio.Recording();
    await recording.prepareToRecordAsync({
      ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
      meteringEnabled: true,
    });
    await recording.startAsync();

    recordingRef.current = recording;
    samplesRef.current = [];
  };

  const stopRecording = async () => {
    try {
      await recordingRef.current?.stopAndUnloadAsync();
    } catch {}
    recordingRef.current = null;
  };

  // =========================
  // 📊 CAMPIONAMENTO AUDIO
  // =========================
  const sampleLoop = () => {
    return setInterval(async () => {
      if (!recordingRef.current) return;
      const status = await recordingRef.current.getStatusAsync();
      if (status?.metering !== undefined) {
        samplesRef.current.push(Math.abs(status.metering));
      }
    }, 50);
  };

  // =========================
  // ▶️ START CALIBRAZIONE
  // =========================
  const startCalibration = async () => {
    setPhase("silence");
    setSeconds(SILENCE_TIME / 1000);
    setInfo(t("punchCalib.silence", { defaultValue: "Rimani in silenzio…" }));

    await startRecording();
    const interval = sampleLoop();

    setTimeout(async () => {
      clearInterval(interval);
      await stopRecording();

      const noise =
        samplesRef.current.reduce((a, b) => a + b, 0) /
        samplesRef.current.length;

      await AsyncStorage.setItem("noiseFloor", noise.toString());

      // 🔥 FASE COLPI
      setPhase("punch");
      setSeconds(PUNCH_TIME / 1000);
      setInfo(t("punchCalib.punch", { defaultValue: "Colpisci il sacco come in allenamento" }));

      await startRecording();
      const interval2 = sampleLoop();

      setTimeout(async () => {
        clearInterval(interval2);
        await stopRecording();

        const maxPunch = Math.max(...samplesRef.current);
        const threshold = noise + (maxPunch - noise) * 0.45;

        const sensitivity = Math.min(
          1,
          Math.max(0.2, 1 - threshold / 160)
        );

        await AsyncStorage.multiSet([
          ["punchThreshold", threshold.toString()],
          ["punchSensitivity", sensitivity.toString()],
          ["punchCalibrated", "true"],
        ]);

        setPhase("done");
        setInfo(t("punchCalib.done", { defaultValue: "Calibrazione completata ✔️" }));
      }, PUNCH_TIME);
    }, SILENCE_TIME);
  };

  // =========================
  // ⏱ TIMER VISIVO
  // =========================
  useEffect(() => {
    if (seconds <= 0) return;
    const t = setInterval(() => setSeconds((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [seconds]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.root}>
        <Text style={styles.title}>{t("punchCalib.title", { defaultValue: "Calibrazione colpi" })}</Text>

        <Text style={styles.info}>{info}</Text>

        {seconds > 0 && (
          <Text style={styles.timer}>{seconds}s</Text>
        )}

        {phase === "idle" && (
          <Pressable style={styles.btn} onPress={startCalibration}>
            <Text style={styles.btnText}>{t("punchCalib.start", { defaultValue: "AVVIA CALIBRAZIONE" })}</Text>
          </Pressable>
        )}

        {phase === "done" && (
          <Pressable
            style={styles.btn}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.btnText}>{t("punchCalib.back", { defaultValue: "TORNA ALLE IMPOSTAZIONI" })}</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#050508" },
  root: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 20,
  },
  info: {
    color: "#aaa",
    fontSize: 16,
    marginBottom: 20,
    textAlign: "center",
  },
  timer: {
    color: "#37E293",
    fontSize: 48,
    fontWeight: "800",
    marginBottom: 20,
  },
  btn: {
    backgroundColor: "#37E293",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  btnText: {
    color: "#000",
    fontWeight: "700",
    fontSize: 16,
  },
});
