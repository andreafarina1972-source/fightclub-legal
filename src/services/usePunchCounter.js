// src/services/usePunchCounter.js
import { useEffect, useRef, useState } from "react";
import { Audio } from "expo-av";

export default function usePunchCounter(initialSensitivity = 0.5) {
  const [punches, setPunches] = useState(0);
  const [sensitivity, setSensitivity] = useState(initialSensitivity); // 0–1
  const recordingRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    return () => {
      stopListening();
    };
  }, []);

  const startListening = async () => {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        isMeteringEnabled: true,
        android: {
          extension: ".m4a",
          outputFormat: Audio.RECORDING_OPTION_ANDROID_OUTPUT_FORMAT_MPEG_4,
          audioEncoder: Audio.RECORDING_OPTION_ANDROID_AUDIO_ENCODER_AAC,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          extension: ".m4a",
          outputFormat: Audio.RECORDING_OPTION_IOS_OUTPUT_FORMAT_MPEG4AAC,
          audioQuality: Audio.RECORDING_OPTION_IOS_AUDIO_QUALITY_HIGH,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
        },
      });

      await recording.startAsync();
      recordingRef.current = recording;

      intervalRef.current = setInterval(async () => {
        const status = await recording.getStatusAsync();
        if (!status.isRecording || !status.metering) return;
        const level = status.metering; // dB

        // threshold base: tra -60 (silenzio) e 0 (molto forte)
        const normalized = 1 - Math.min(1, Math.max(0, (level + 60) / 60));
        // se sopra la sensibilità → conta un colpo
        if (normalized > sensitivity) {
          setPunches((p) => p + 1);
        }
      }, 120);
    } catch (e) {
      console.log("Errore contatore colpi:", e);
    }
  };

  const stopListening = async () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch {}
      recordingRef.current = null;
    }
  };

  return {
    punches,
    sensitivity,
    setSensitivity,
    startListening,
    stopListening,
  };
}
