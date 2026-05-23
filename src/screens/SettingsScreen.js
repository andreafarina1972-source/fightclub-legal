// src/screens/SettingsScreen.js
import React, { useEffect, useState, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Switch,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
  Modal,
  Pressable,
  FlatList,
} from "react-native";
import { Audio } from "expo-av";
import AsyncStorage from "@react-native-async-storage/async-storage";
import GlassCard from "../components/ui/GlassCard";
import VolumeSlider from "../components/ui/VolumeSlider";
import SoundLevelVisualizer from "../components/ui/SoundLevelVisualizer";
import { connectHeartRate, disconnectHeartRate } from "../services/heartRateService";
import { setSoundEnabledSingle, playBeep, playGong, playCount1 } from "../services/soundManager";

// ✅ i18n
import { t, i18n, SUPPORTED_LANGUAGES } from "../i18n";
import { useLanguage } from "../i18n/LanguageContext";

// ✅ voice coach toggle
import { getVoiceCoachEnabled, setVoiceCoachEnabled } from "../services/voiceCoach";

// FIX: chiave allineata a hrZones.js (AGE_KEY = "athleteAge")
// Prima era "userAge" → getAthleteAge() non leggeva mai l'età impostata dall'utente
const USER_AGE_KEY = "athleteAge";

export default function SettingsScreen() {
  // ✅ LINGUA (globale via provider)
  const { lang, setLang: setAppLang } = useLanguage();

  // ✅ VOCE COACH
  const [voiceCoachOn, setVoiceCoachOn] = useState(true);

  // 🔊 AUDIO
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [beepOn, setBeepOn] = useState(true);
  const [gongOn, setGongOn] = useState(true);
  const [countdownOn, setCountdownOn] = useState(true);
  const [audioProfile, setAudioProfile] = useState("custom");

  // 🥊 SENSIBILITÀ (0–100)
  const [punchSensitivity, setPunchSensitivity] = useState(35);
  const saveSensTimer = useRef(null);

  // ✅ PROFILO ATLETA: età (anni)
  const [userAge, setUserAge] = useState(30);
  const [userAgeText, setUserAgeText] = useState("30");
  const saveAgeTimer = useRef(null);

  // calibrazione
  const [calibrated, setCalibrated] = useState(false);

  // ❤️ HR
  const [hrStatus, setHrStatus] = useState("disconnected");
  const [currentHr, setCurrentHr] = useState(null);

  // UI
  const [visualizerActive, setVisualizerActive] = useState(false);
  const soundTimeout = useRef(null);

  useEffect(() => {
    loadSavedSettings();
    return () => {
      if (saveSensTimer.current) clearTimeout(saveSensTimer.current);
      if (saveAgeTimer.current) clearTimeout(saveAgeTimer.current);
      if (soundTimeout.current) clearTimeout(soundTimeout.current);
    };
  }, []);

  const loadSavedSettings = async () => {
    try {
      // ✅ carica toggle voce coach
      const v = await getVoiceCoachEnabled();
      setVoiceCoachOn(!!v);

      const enabled = await AsyncStorage.getItem("soundEnabled");
      setSoundEnabled(enabled !== "false");

      setBeepOn((await AsyncStorage.getItem("soundEnabled_beep")) !== "false");
      setGongOn((await AsyncStorage.getItem("soundEnabled_gong")) !== "false");
      setCountdownOn((await AsyncStorage.getItem("soundEnabled_countdown")) !== "false");

      const savedSensRaw = await AsyncStorage.getItem("punchSensitivity");
      const savedSens = savedSensRaw === null ? 35 : parseInt(savedSensRaw, 10);
      setPunchSensitivity(Number.isFinite(savedSens) ? clampInt(savedSens, 0, 100) : 35);

      const nf = await AsyncStorage.getItem("punchNoiseFloor");
      const pk = await AsyncStorage.getItem("punchPeak");
      setCalibrated(!!(nf && pk));

      const savedProfile = await AsyncStorage.getItem("audioProfile");
      if (savedProfile) setAudioProfile(savedProfile);

      const savedAgeRaw = await AsyncStorage.getItem(USER_AGE_KEY);
      if (savedAgeRaw !== null) {
        const a = parseInt(savedAgeRaw, 10);
        if (Number.isFinite(a)) {
          const safeA = clampInt(a, 5, 90);
          setUserAge(safeA);
          setUserAgeText(String(safeA));
        }
      } else {
        setUserAge(30);
        setUserAgeText("30");
      }
    } catch (err) {
      console.log("Errore caricamento impostazioni:", err);
    }
  };

  const playPreview = (fn) => {
    if (!soundEnabled) return;
    if (soundTimeout.current) clearTimeout(soundTimeout.current);
    setVisualizerActive(true);
    soundTimeout.current = setTimeout(() => {
      fn();
      setTimeout(() => setVisualizerActive(false), 500);
    }, 150);
  };

  const applyProfile = async (profile) => {
    setAudioProfile(profile);
    await AsyncStorage.setItem("audioProfile", profile);

    const profiles = {
      silent: { beep: false, gong: false, countdown: false },
      coaching: { beep: true, gong: true, countdown: false },
      fight: { beep: true, gong: true, countdown: true },
    };

    const mode = profiles[profile] || profiles.fight;

    setBeepOn(mode.beep);
    setGongOn(mode.gong);
    setCountdownOn(mode.countdown);

    setSoundEnabledSingle("beep", mode.beep);
    setSoundEnabledSingle("gong", mode.gong);
    setSoundEnabledSingle("countdown", mode.countdown);

    setVisualizerActive(true);
    playCount1();
    setTimeout(() => setVisualizerActive(false), 500);
  };

  const calibratePunchCounter = async () => {
    Alert.alert(t("settingsScreen.calibrationTitle"), t("settingsScreen.calibrationBody"));
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t("settingsScreen.error"), t("settingsScreen.micDenied"));
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        meteringEnabled: true,
      });
      await rec.startAsync();

      const noise = [];
      const peaks = [];
      const startTs = Date.now();

      const intv = setInterval(async () => {
        const st = await rec.getStatusAsync();
        if (st?.metering === undefined || st?.metering === null) return;
        const level = Math.abs(st.metering);
        if (Date.now() - startTs < 3000) noise.push(level);
        else peaks.push(level);
      }, 60);

      setTimeout(async () => {
        clearInterval(intv);
        await rec.stopAndUnloadAsync();

        const noiseFloor = noise.length ? Math.min(...noise) : 30;
        const punchPeak = peaks.length ? Math.max(...peaks) : 120;

        await AsyncStorage.setItem("punchNoiseFloor", noiseFloor.toString());
        await AsyncStorage.setItem("punchPeak", punchPeak.toString());
        setCalibrated(true);
        Alert.alert(t("settingsScreen.calibrationOkTitle"), t("settingsScreen.calibrationOkBody"));
      }, 6000);
    } catch (e) {
      console.log("Errore calibrazione:", e);
      Alert.alert(t("settingsScreen.error"), t("settingsScreen.calibrationFail"));
    }
  };

  const onChangeAgeText = (txt) => {
    const onlyDigits = String(txt || "").replace(/[^\d]/g, "");
    setUserAgeText(onlyDigits);

    if (saveAgeTimer.current) clearTimeout(saveAgeTimer.current);
    saveAgeTimer.current = setTimeout(async () => {
      if (!onlyDigits) {
        await AsyncStorage.removeItem(USER_AGE_KEY);
        return;
      }
      const a = clampInt(parseInt(onlyDigits, 10), 5, 90);
      setUserAge(a);
      setUserAgeText(String(a));
      await AsyncStorage.setItem(USER_AGE_KEY, String(a));
    }, 220);
  };

  // ❤️ HR
  const handleConnectHr = async () => {
    try {
      setHrStatus("scanning");
      await connectHeartRate((bpm) => {
        setCurrentHr(bpm);
        setHrStatus("connected");
      });
    } catch {
      setHrStatus("disconnected");
    }
  };

  const handleDisconnectHr = async () => {
    await disconnectHeartRate();
    setCurrentHr(null);
    setHrStatus("disconnected");
  };

  // ✅ Cambio lingua (globale) + re-render app
  const applyLanguage = async (code) => {
    try {
      await setAppLang(code);
    } catch (e) {
      console.log("Errore cambio lingua:", e);
    }
  };

  const currentLanguage = lang || i18n?.locale || "en";

  // ✅ LINGUE: usa SOLO l'ordine di SUPPORTED_LANGUAGES (come definito in index.js)
  const ALL_LANGUAGES = useMemo(() => {
    // dedup mantenendo l'ordine (prima occorrenza vince)
    const seen = new Set();
    const out = [];
    (SUPPORTED_LANGUAGES || []).forEach((l) => {
      if (!l?.code) return;
      if (seen.has(l.code)) return;
      seen.add(l.code);
      out.push(l);
    });
    return out;
  }, []);

  const currentLanguageLabel =
    ALL_LANGUAGES.find((l) => l.code === currentLanguage)?.label || currentLanguage;

  // ✅ Modal lingua (molte opzioni + ricerca)
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [languageSearch, setLanguageSearch] = useState("");

  const filteredLanguages = useMemo(() => {
    if (!languageSearch) return ALL_LANGUAGES;
    const q = languageSearch.toLowerCase();
    return ALL_LANGUAGES.filter((l) => {
      return (
        (l.label || "").toLowerCase().includes(q) ||
        (l.code || "").toLowerCase().includes(q)
      );
    });
  }, [languageSearch, ALL_LANGUAGES]);

  const openLanguageDropdown = () => {
    setLanguageSearch("");
    setLanguageModalVisible(true);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.root}>
          <Text style={styles.title}>{t("settings")}</Text>
          <SoundLevelVisualizer active={visualizerActive} />

          {/* ✅ LINGUA: dropdown */}
          <GlassCard>
            <Text style={styles.label}>{t("language")}</Text>

            <TouchableOpacity style={styles.dropdownBtn} onPress={openLanguageDropdown}>
              <Text style={styles.dropdownText}>{currentLanguageLabel}</Text>
              <Text style={styles.dropdownChevron}>▾</Text>
            </TouchableOpacity>

            <Text style={styles.subSmall}>
              {t("settingsScreen.languagesAvailable", { n: ALL_LANGUAGES.length })}
            </Text>
          </GlassCard>

          {/* ✅ MODAL SELEZIONE LINGUA (scroll + ricerca) */}
          <Modal
            visible={languageModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setLanguageModalVisible(false)}
          >
            <Pressable style={styles.modalBackdrop} onPress={() => setLanguageModalVisible(false)} />

            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{t("language")}</Text>
                <TouchableOpacity onPress={() => setLanguageModalVisible(false)}>
                  <Text style={styles.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>

              <TextInput
                value={languageSearch}
                onChangeText={setLanguageSearch}
                placeholder="Search…"
                placeholderTextColor="#666"
                style={styles.modalSearch}
                autoCorrect={false}
                autoCapitalize="none"
              />

              <FlatList
                data={filteredLanguages}
                keyExtractor={(item) => item.code}
                keyboardShouldPersistTaps="handled"
                style={{ maxHeight: 420 }}
                renderItem={({ item }) => {
                  const active = item.code === currentLanguage;
                  return (
                    <TouchableOpacity
                      style={[styles.langRow, active && styles.langRowActive]}
                      onPress={async () => {
                        await applyLanguage(item.code);
                        setLanguageModalVisible(false);
                      }}
                    >
                      <Text style={[styles.langLabel, active && styles.langLabelActive]}>
                        {item.label}
                      </Text>
                      <Text style={styles.langCode}>{item.code}</Text>
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={<Text style={styles.modalEmpty}>No results</Text>}
              />
            </View>
          </Modal>

          {/* ✅ VOCE COACH */}
          <GlassCard>
            <Text style={styles.label}>{t("voiceCoach")}</Text>
            <View style={styles.row}>
              <Text style={styles.sub}>{t("voiceCoachDesc")}</Text>
              <Switch
                value={voiceCoachOn}
                onValueChange={async (v) => {
                  setVoiceCoachOn(v);
                  await setVoiceCoachEnabled(v);
                }}
              />
            </View>
          </GlassCard>

          {/* ✅ PROFILO ATLETA */}
          <GlassCard>
            <Text style={styles.label}>{t("settingsScreen.athleteProfile")}</Text>
            <Text style={styles.sub}>{t("settingsScreen.ageDesc")}</Text>

            <View style={styles.ageRow}>
              <TextInput
                value={userAgeText}
                onChangeText={onChangeAgeText}
                placeholder="30"
                placeholderTextColor="#666"
                keyboardType="number-pad"
                maxLength={2}
                style={styles.ageInput}
              />
              <View style={styles.agePill}>
                <Text style={styles.agePillText}>
                  {t("settingsScreen.ageYears", { n: userAge })}
                </Text>
              </View>
            </View>

            <Text style={styles.subSmall}>{t("settingsScreen.validRange")}</Text>
          </GlassCard>

          {/* 🎧 PROFILI AUDIO */}
          <GlassCard>
            <Text style={styles.label}>{t("settingsScreen.audioProfiles")}</Text>

            {["silent", "coaching", "fight"].map((k) => (
              <TouchableOpacity
                key={k}
                style={[styles.profileBtn, audioProfile === k && styles.profileActive]}
                onPress={() => applyProfile(k)}
              >
                <Text style={styles.profileText}>
                {t(`settingsScreen.audioProfile_${k}`, { defaultValue: k.toUpperCase() })}
                </Text>
              </TouchableOpacity>
            ))}
          </GlassCard>

          {/* 🔊 SUONI GLOBALI */}
          <GlassCard>
            <Text style={styles.label}>{t("settingsScreen.soundsGlobal")}</Text>
            <View style={styles.row}>
              <Text style={styles.sub}>{t("settingsScreen.enableAllSounds")}</Text>
              <Switch
                value={soundEnabled}
                onValueChange={(v) => {
                  setSoundEnabled(v);
                  AsyncStorage.setItem("soundEnabled", v.toString());
                }}
              />
            </View>
          </GlassCard>

          {/* 🔊 SUONI INDIVIDUALI */}
          <GlassCard>
            <Text style={styles.label}>{t("settingsScreen.soundsIndividual")}</Text>

            {[
              ["Beep", beepOn, setBeepOn, playBeep, "beep"],
              ["Gong", gongOn, setGongOn, playGong, "gong"],
              ["Countdown", countdownOn, setCountdownOn, playCount1, "countdown"],
            ].map(([label, state, setState, fn, key]) => (
              <View key={key} style={styles.row}>
                <Text style={styles.sub}>{label}</Text>
                <Switch
                  value={state}
                  onValueChange={(v) => {
                    setState(v);
                    setSoundEnabledSingle(key, v);
                    setAudioProfile("custom");
                    if (v) playPreview(fn);
                  }}
                />
              </View>
            ))}
          </GlassCard>

          {/* 🥊 SENSIBILITÀ COLPI 0–100 */}
          <GlassCard>
            <Text style={styles.label}>{t("settingsScreen.sensitivity")}</Text>
            <VolumeSlider
              label={t("settingsScreen.adjustSensitivity")}
              min={0}
              max={100}
              step={1}
              value={punchSensitivity}
              showPercent={true}
              onChange={(v) => {
                const safe = clampInt(Math.round(v), 0, 100);
                setPunchSensitivity(safe);
                if (saveSensTimer.current) clearTimeout(saveSensTimer.current);
                saveSensTimer.current = setTimeout(() => {
                  AsyncStorage.setItem("punchSensitivity", safe.toString());
                }, 160);
              }}
            />
            <Text style={styles.sensValue}>{punchSensitivity}%</Text>
            <Text style={styles.sub}>{t("settingsScreen.sensitivityHint")}</Text>
          </GlassCard>

          {/* 🎯 CALIBRAZIONE */}
          <GlassCard>
            <Text style={styles.label}>{t("settingsScreen.punchCounter")}</Text>
            <Text style={styles.sub}>
              {t("common.status")}:{" "}
              <Text style={{ fontWeight: "700", color: calibrated ? "#37E293" : "#E33535" }}>
                {calibrated ? t("settingsScreen.calibrated") : t("settingsScreen.notCalibrated")}
              </Text>
            </Text>

            <TouchableOpacity style={styles.profileBtn} onPress={calibratePunchCounter}>
              <Text style={styles.profileText}>{t("settingsScreen.calibrate")}</Text>
            </TouchableOpacity>
          </GlassCard>

          {/* ❤️ CARDIO */}
          <GlassCard>
            <Text style={styles.label}>{t("settingsScreen.cardioBand")}</Text>
            <Text style={styles.sub}>
              {t("common.status")}:{" "}
              <Text
                style={{
                  fontWeight: "700",
                  color:
                    hrStatus === "connected"
                      ? "#37E293"
                      : hrStatus === "scanning"
                      ? "#F6B100"
                      : "#777",
                }}
              >
                {hrStatus.toUpperCase()}
              </Text>
            </Text>

            {currentHr && <Text style={styles.hrValue}>❤️ {currentHr} bpm</Text>}

            <TouchableOpacity
              style={[styles.profileBtn, hrStatus === "connected" && { backgroundColor: "#331111" }]}
              onPress={hrStatus === "connected" ? handleDisconnectHr : handleConnectHr}
            >
              <Text style={styles.profileText}>
                {hrStatus === "connected"
                  ? t("settingsScreen.disconnect")
                  : t("settingsScreen.connect")}
              </Text>
            </TouchableOpacity>
          </GlassCard>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function clampInt(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#050508" },
  scroll: { paddingBottom: 110 },
  root: { padding: 16 },
  title: { color: "#fff", fontSize: 22, fontWeight: "700", marginBottom: 12 },
  label: { color: "#fff", fontSize: 16, fontWeight: "600", marginBottom: 6 },
  sub: { color: "#8E8E99", fontSize: 13 },
  subSmall: { color: "#666", fontSize: 12, marginTop: 8 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
  },
  profileBtn: {
    backgroundColor: "#111",
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#222",
  },
  profileActive: { borderColor: "#37E293", backgroundColor: "#0d1f14" },
  profileText: { color: "#fff", textAlign: "center", fontWeight: "600" },

  // ✅ dropdown language
  dropdownBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#111",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#222",
  },
  dropdownText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  dropdownChevron: { color: "#8E8E99", fontSize: 18, fontWeight: "900" },

  sensValue: {
    color: "#37E293",
    textAlign: "right",
    fontWeight: "800",
    marginTop: 4,
  },
  hrValue: { marginTop: 8, color: "#F44336", fontSize: 20, fontWeight: "800" },
  ageRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  ageInput: {
    flex: 1,
    backgroundColor: "#0c0c0c",
    borderWidth: 1,
    borderColor: "#222",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#fff",
    fontWeight: "700",
  },
  agePill: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#2D2C33",
    backgroundColor: "#101018",
  },
  agePillText: { color: "#37E293", fontWeight: "800" },

  // ✅ modal language
  modalBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  modalSheet: {
    position: "absolute",
    left: 16,
    right: 16,
    top: 120,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#222",
    backgroundColor: "#0b0b10",
    padding: 14,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  modalTitle: { color: "#fff", fontSize: 16, fontWeight: "800" },
  modalClose: { color: "#8E8E99", fontSize: 18, fontWeight: "900" },
  modalSearch: {
    backgroundColor: "#111",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#222",
    color: "#fff",
    fontWeight: "700",
    marginBottom: 10,
  },
  langRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1e1e28",
    backgroundColor: "#0f0f16",
    marginBottom: 8,
  },
  langRowActive: { borderColor: "#37E293", backgroundColor: "#0d1f14" },
  langLabel: { color: "#fff", fontWeight: "800" },
  langLabelActive: { color: "#37E293" },
  langCode: { color: "#8E8E99", fontWeight: "800" },
  modalEmpty: { color: "#8E8E99", textAlign: "center", paddingVertical: 16 },
});
