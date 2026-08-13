// src/screens/HomeScreen.js
import React, { useCallback, useRef, useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import GlassCard from "../components/ui/GlassCard";
import AdBanner from "../components/AdBanner";
import ProGate from "../components/ProGate";
import LoadDecisionCard from "../components/LoadDecisionCard";
import { useLoadDecision } from "../hooks/useLoadDecision";
import { connectHeartRate, subscribeHeartRate } from "../services/heartRateService";

// ✅ storico (sessions + vo2)
import { useHistoryData } from "../context/HistoryContext";

// ✅ VO2
import { estimateVo2Max, getVo2TestMinHr } from "../services/vo2Utils";
// FIX #11: legge età reale dalle Settings invece di usare 35 hardcoded
import { getAthleteAge } from "../services/hrZones";

// ✅ i18n
import { t } from "../i18n";
import { loadAiPlan, getTodaySession, formatWorkoutParams, isPlanCurrentWeek } from "../services/aiCoach";

// ✅ formato richiesto: gg/mm/anno  18:42
function formatDateTime(iso) {
  if (!iso) return "--";
  try {
    const d = new Date(iso);

    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();

    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");

    return `${dd}/${mm}/${yyyy}  ${hh}:${min}`;
  } catch {
    return "--";
  }
}

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  // ⚠️ compatibilità: se in HistoryContext non esistono (ancora) latestVo2 / addVo2Measurement
  // non deve crashare.
  const history = useHistoryData?.() || {};
  const sessions = Array.isArray(history.sessions) ? history.sessions : [];
  const latestVo2 = history.latestVo2;
  const addVo2Measurement = history.addVo2Measurement;

  // --- VO2 misura da Home (HR medio su 30s) ---
  const [vo2Measuring, setVo2Measuring] = useState(false);
  const [vo2SecLeft, setVo2SecLeft] = useState(0);
  const vo2SamplesRef = useRef([]);
  const vo2TimerRef = useRef(null);
  // FIX #11: carica età reale dalle Settings (non più hardcoded 35)
  const [athleteAge, setAthleteAge] = useState(35);
  const [athleteHrRest, setAthleteHrRest] = useState(60);
  useEffect(() => {
    getAthleteAge().then((a) => { if (a != null) setAthleteAge(a); }).catch(() => {});
    // Legge HRrest dalle Settings (chiave 'hrRest', salvata da SettingsScreen)
    import('../services/hrZones').then(({ getHrMax }) => {}).catch(() => {});
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      AsyncStorage.getItem('hrRest').then((v) => {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 30 && n <= 100) setAthleteHrRest(n);
      }).catch(() => {});
    } catch {}
  }, []);

  const [aiPlan, setAiPlan] = useState(null);
  const [aiTodaySession, setAiTodaySession] = useState(null);

  // Un'unica chiamata per schermata (nessun ricalcolo, stesso vincolo di
  // AiCoachScreen): alimenta la card motore decisionale sotto, dietro
  // ProGate in modalità teaser perché la home non è già Pro-gated.
  const { decision: loadDecision, readiness: loadDecisionReadiness, loading: loadDecisionLoading } = useLoadDecision();
  useFocusEffect(useCallback(() => {
    loadAiPlan().then(plan => {
      if (plan && isPlanCurrentWeek(plan)) {
        setAiPlan(plan); setAiTodaySession(getTodaySession(plan));
      } else { setAiPlan(null); setAiTodaySession(null); }
    }).catch(() => {});
  }, []));
  const latestVo2Label = useMemo(() => {
    const v = Number(latestVo2?.value);
    return Number.isFinite(v) ? `${Math.round(v * 10) / 10}` : "--";
  }, [latestVo2]);

  // ✅ Ultimo allenamento: prende la sessione più recente da sessions
  const lastSession = useMemo(() => {
    if (!sessions.length) return null;

    let best = sessions[0];
    let bestTs = Date.parse(best?.date || "") || Number(best?.id) || 0;

    for (const s of sessions) {
      const ts = Date.parse(s?.date || "") || Number(s?.id) || 0;
      if (ts > bestTs) {
        best = s;
        bestTs = ts;
      }
    }
    return best || null;
  }, [sessions]);

  const lastRoundsText = useMemo(() => {
    const rounds =
      Number(lastSession?.rounds) ||
      (Array.isArray(lastSession?.punchesByRound) ? lastSession.punchesByRound.length : 0);
    return rounds > 0 ? `${rounds} round` : "--";
  }, [lastSession]);

  const lastWorkoutSub = useMemo(() => {
    if (!lastSession) return t("historyScreen.empty");

    const mins = Number.isFinite(Number(lastSession?.totalMinutes))
      ? Math.round(Number(lastSession.totalMinutes))
      : null;

    const kcal = Number.isFinite(Number(lastSession?.calories))
      ? Math.round(Number(lastSession.calories))
      : null;

    const parts = [];
    if (mins != null) parts.push(`${mins} min`);
    if (kcal != null) parts.push(`${kcal} kcal`);

    const base = parts.length ? parts.join(" • ") : "--";
    return lastSession?.interrupted ? `${base} • ${t("home.interruptedSuffix") || "interrotto"}` : base;
  }, [lastSession]);

  const lastWorkoutDateText = useMemo(() => {
    return lastSession?.date ? formatDateTime(lastSession.date) : "--";
  }, [lastSession]);

  // --- HR badge ---
  const [hr, setHr] = useState(null);
  const [hrStatus, setHrStatus] = useState("disconnected"); // disconnected | scanning | connected
  const connectingRef = useRef(false);

  const stopVo2Measure = useCallback(
    async (reason = "done") => {
      if (vo2TimerRef.current) {
        clearInterval(vo2TimerRef.current);
        vo2TimerRef.current = null;
      }

      setVo2Measuring(false);

      const samples = vo2SamplesRef.current || [];
      vo2SamplesRef.current = [];

      if (reason !== "done") return;

      const valid = samples.filter((x) => Number.isFinite(x) && x >= 60 && x <= 240);
      if (valid.length < 10) {
        Alert.alert("VO₂ max", t("home.vo2InsufficientData") || "Dati HR insufficienti. Verifica la fascia cardio e riprova.");
        return;
      }

      const avgHr = Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);

      const age = athleteAge; // FIX #11: usa età dalle Settings (non più 35 hardcoded)
      const vo2 = estimateVo2Max(avgHr, age, athleteHrRest); // formula Uth con HRrest
      if (!vo2) {
        const target = getVo2TestMinHr(age);
        Alert.alert(
          "VO₂ max",
          t("home.vo2FailBody", { target }) || `Frequenza cardiaca troppo bassa durante il test (serve almeno l'85% della FC massima, circa ${target} bpm). Fai uno sforzo più intenso per tutti i 30 secondi e riprova.`
        );
        return;
      }

      // ✅ salva SOLO se la funzione esiste (così non crasha mai)
      if (typeof addVo2Measurement === "function") {
        await Promise.resolve(
          addVo2Measurement({
            value: vo2,
            avgHr,
            age,
            method: "hr_avg_home",
          })
        );
      }

      Alert.alert(
        t("home.vo2SavedTitle") || "VO₂ max salvato",
        t("home.vo2SavedBody", { vo2, avgHr }) || `Stima: ${vo2} ml/kg/min (HR media: ${avgHr} bpm)`
      );
    },
    [addVo2Measurement, athleteAge, athleteHrRest]
  );

  // Avvia davvero il conto alla rovescia e il campionamento HR (dopo la conferma delle istruzioni)
  const beginVo2Timer = useCallback(() => {
    const durationSec = 30;

    vo2SamplesRef.current = [];
    setVo2Measuring(true);
    setVo2SecLeft(durationSec);

    if (vo2TimerRef.current) {
      clearInterval(vo2TimerRef.current);
      vo2TimerRef.current = null;
    }

    vo2TimerRef.current = setInterval(() => {
      const bpm = Number(hr);
      if (Number.isFinite(bpm) && bpm > 0) {
        vo2SamplesRef.current.push(bpm);
      }

      setVo2SecLeft((s) => {
        const next = Math.max(0, (Number(s) || 0) - 1);
        if (next <= 0) {
          stopVo2Measure("done");
          return 0;
        }
        return next;
      });
    }, 1000);
  }, [hr, stopVo2Measure]);

  const startVo2Measure = useCallback(() => {
    if (vo2Measuring) return;

    if (hrStatus !== "connected") {
      Alert.alert(
        "VO₂ max",
        t("home.vo2NeedStrap") || "Collega prima la fascia cardio (Bluetooth) e attendi i bpm nella Home, poi riprova."
      );
      return;
    }

    // ✅ FIX: la stima richiede scientificamente una FC ≥85% della FC massima (vedi
    // guardia in vo2Utils.js), quindi va richiesto chiaramente uno sforzo quasi
    // massimale — altrimenti il test fallisce sempre.
    const target = getVo2TestMinHr(athleteAge);
    Alert.alert(
      t("home.vo2InstructionsTitle") || "Test VO₂ max",
      t("home.vo2InstructionsBody", { target }) || `Fai uno sforzo il più intenso possibile per tutti i 30 secondi (sprint, salti esplosivi, corsa veloce sul posto): la frequenza cardiaca deve superare circa ${target} bpm (85% della FC massima stimata) per una stima scientificamente valida.`,
      [
        { text: t("common.cancel") || "Annulla", style: "cancel" },
        { text: t("home.vo2InstructionsGo") || "Via!", onPress: beginVo2Timer },
      ]
    );
  }, [vo2Measuring, hrStatus, beginVo2Timer, athleteAge]);

  useEffect(() => {
    return () => {
      if (vo2TimerRef.current) {
        clearInterval(vo2TimerRef.current);
        vo2TimerRef.current = null;
      }
    };
  }, []);

  // ✅ subscribe HR
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

  // ✅ prova connessione quando la schermata va in focus
  useFocusEffect(
    useCallback(() => {
      let alive = true;

      (async () => {
        if (connectingRef.current) return;
        connectingRef.current = true;

        try {
          setHrStatus("scanning");
          await connectHeartRate();
        } catch (e) {
          if (!alive) return;
          setHrStatus("disconnected");
        } finally {
          connectingRef.current = false;
        }
      })();

      return () => {
        alive = false;
      };
    }, [])
  );

  const badgeStatusText =
    hrStatus === "connected"
      ? t("home.hrConnectedDot")
      : hrStatus === "scanning"
      ? t("home.hrScanningDot")
      : t("home.hrOffDot");

  const goWorkoutBuilder = () => {
    const parentNav = navigation.getParent?.();
    if (parentNav) parentNav.navigate("WorkoutBuilder");
    else navigation.navigate("WorkoutBuilder");
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={[styles.root, { paddingTop: 8 }]}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>FIGHTCLUB</Text>
            <Text style={styles.subtitle}>{t("home.subtitle")}</Text>
          </View>

          <View style={styles.badge}>
            <Ionicons name="heart-outline" size={16} color="#37E293" />
            <Text style={styles.badgeText}>
              {hr ? `${hr} bpm` : "-- bpm"} <Text style={styles.badgeSub}>{badgeStatusText}</Text>
            </Text>
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 24 + insets.bottom + 90 }}
          showsVerticalScrollIndicator={false}
        >
          {/* MOTORE DECISIONALE — sopra il resto, come in AiCoachScreen.
              La home non è dietro ProGate: qui il gating è sulla card
              stessa (teaser sfocato + CTA per utenti free, stesso pattern
              di HistoryScreen/TimerScreen). loadingDecisionCard è definita
              una volta sola e riusata sia come teaser sia come contenuto
              reale, per non costruire due volte lo stesso JSX. */}
          {(() => {
            const loadDecisionCard = (
              <LoadDecisionCard decision={loadDecision} readiness={loadDecisionReadiness} loading={loadDecisionLoading} />
            );
            return (
              <ProGate
                title={t("home.loadDecisionTitle") || "Decisione sul carico"}
                teaser={loadDecisionCard}
              >
                {loadDecisionCard}
              </ProGate>
            );
          })()}

          {aiPlan && aiTodaySession ? (
            <GlassCard style={[styles.mainTimerCard, { borderColor: "rgba(55,226,147,0.2)" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={styles.sectionLabel}>{t("home.nextWorkout")}</Text>
                <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>{t("home.aiCoach") || "AI Coach"}</Text></View>
              </View>
              <Text style={styles.workoutName}>{aiTodaySession.name}</Text>
              <Text style={styles.aiObjective}>{aiTodaySession.objective}</Text>
              {aiTodaySession.workout && (
                <View style={styles.aiWorkoutBox}>
                  <Text style={styles.aiWorkoutText}>{formatWorkoutParams({ ...aiTodaySession.workout, durationMin: aiTodaySession.durationMin }, aiTodaySession.type)}</Text>
                  {aiTodaySession.intensityTarget && (
                    <Text style={styles.aiIntensity}>{aiTodaySession.intensityTarget}</Text>
                  )}
                </View>
              )}
              <View style={{ flexDirection: "row", gap: 10 }}>
                {aiTodaySession.workout && (
                  <Pressable style={[styles.primaryButton, { flex: 1 }]}
                    onPress={() => { const nav = navigation.getParent?.() || navigation; nav.navigate("TimerRun", { workout: { ...aiTodaySession.workout, name: aiTodaySession.name }, autoStart: true }); }}>
                    <Ionicons name="play" size={18} color="#050508" />
                    <Text style={styles.primaryButtonText}>{t("aiCoach.startNow") || "Avvia ora"}</Text>
                  </Pressable>
                )}
                <Pressable style={styles.aiCoachBtn} onPress={() => navigation.navigate("AiCoach")}>
                  <Text style={styles.aiCoachBtnText}>{t("home.viewPlan") || "Vedi piano"}</Text>
                </Pressable>
              </View>
            </GlassCard>
          ) : (
            <GlassCard style={styles.mainTimerCard}>
              <Text style={styles.sectionLabel}>{t("home.nextWorkout")}</Text>
              <View style={styles.circleWrapper}>
                <View style={styles.circleOuter}>
                  <View style={styles.circleInner}>
                    <Text style={styles.circleTop}>ROUND</Text>
                    <Text style={styles.circleMain}>01</Text>
                    <Text style={styles.circleBottom}>03:00</Text>
                  </View>
                </View>
              </View>
              <Pressable style={styles.primaryButton} onPress={() => navigation.navigate("AiCoach")}>
                <Text style={styles.primaryButtonText}>{t("home.generateAiPlan") || "Genera piano AI"}</Text>
              </Pressable>
            </GlassCard>
          )}

          <View style={styles.row}>
            {/* ✅ ULTIMO ALLENAMENTO DINAMICO + DATA */}
            <GlassCard style={styles.smallCard}>
              <Text style={styles.cardLabel}>{t("home.lastWorkout")}</Text>
              <Text style={styles.cardValue}>{lastRoundsText}</Text>
              <Text style={styles.cardSub}>{lastWorkoutSub}</Text>
              <Text style={styles.cardDate}>{lastWorkoutDateText}</Text>
            </GlassCard>

            {/* ✅ VO2 badge + tasto misurazione */}
            <GlassCard style={styles.smallCard}>
              <Text style={styles.cardLabel}>{t("home.vo2")}</Text>
              <Text style={styles.cardValueHighlight}>{latestVo2Label}</Text>

              {vo2Measuring ? (
                <Text style={styles.cardSub}>{t("home.vo2Moving", { s: vo2SecLeft }) || `Sforzo massimo! ${vo2SecLeft}s`}</Text>
              ) : (
                <Text style={styles.cardSub}>
                  {hrStatus === "connected" ? t("home.hrConnected") : t("home.hrConnect")}
                </Text>
              )}

              <Pressable
                style={styles.vo2Btn}
                onPress={() => {
                  if (vo2Measuring) stopVo2Measure("cancel");
                  else startVo2Measure();
                }}
              >
                <Text style={styles.vo2BtnText}>{vo2Measuring ? t("stop") : t("start")}</Text>
              </Pressable>
            </GlassCard>
          </View>

          <GlassCard>
            <Text style={styles.sectionLabel}>{t("home.quickActions")}</Text>
            <View style={styles.quickRow}>
              <QuickAction icon="timer-outline" label={t("home.freeTimer")} onPress={() => navigation.navigate("QuickTimer")} />
              <QuickAction icon="fitness-outline" label={t("home.createWorkout")} onPress={goWorkoutBuilder} />
              <QuickAction icon="stats-chart-outline" label={t("history")} onPress={() => navigation.navigate("History")} />
              <QuickAction
                icon="create-outline"
                label={t("home.customTimer")}
                onPress={() => {
                  const parentNav = navigation.getParent?.();
                  if (parentNav) parentNav.navigate("CustomTimer");
                  else navigation.navigate("CustomTimer");
                }}
              />
              <QuickAction
                icon="pulse-outline"
                label={t("home.trainingLoad") || "Carico"}
                onPress={() => { const nav = navigation.getParent?.() || navigation; nav.navigate("TrainingLoad"); }}
              />
              <QuickAction
                icon="trophy-outline"
                label={t("home.badges") || "Badge"}
                onPress={() => { const nav = navigation.getParent?.() || navigation; nav.navigate("Badges"); }}
              />
            </View>
          </GlassCard>

          <AdBanner style={{ marginTop: 16 }} />
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function QuickAction({ icon, label, onPress }) {
  return (
    <Pressable style={styles.quickAction} onPress={onPress}>
      <View style={styles.quickIcon}>
        <Ionicons name={icon} size={20} color="#37E293" />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#050508" },
  root: { flex: 1, paddingHorizontal: 16 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: { color: "#FFFFFF", fontSize: 22, fontWeight: "700", letterSpacing: 2 },
  subtitle: { color: "#8E8E99", fontSize: 13, marginTop: 2 },

  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#101018",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#2D2C33",
  },
  badgeText: { color: "#37E293", marginLeft: 4, fontSize: 13, fontWeight: "700" },
  badgeSub: { color: "#777", fontWeight: "500", fontSize: 12 },

  sectionLabel: { color: "#8E8E99", fontSize: 12, letterSpacing: 1, marginBottom: 8 },
  workoutName: { color: "#FFFFFF", fontSize: 18, fontWeight: "600", marginBottom: 12 },
  mainTimerCard: { marginTop: 12 },

  circleWrapper: { alignItems: "center", marginVertical: 10 },
  circleOuter: {
    width: 210,
    height: 210,
    borderRadius: 999,
    borderWidth: 10,
    borderColor: "#37E293",
    justifyContent: "center",
    alignItems: "center",
  },
  circleInner: {
    width: 170,
    height: 170,
    borderRadius: 999,
    backgroundColor: "#050508",
    justifyContent: "center",
    alignItems: "center",
  },
  circleTop: { color: "#8E8E99", fontSize: 12, marginBottom: 4 },
  circleMain: { color: "#FFFFFF", fontSize: 42, fontWeight: "700" },
  circleBottom: { color: "#37E293", fontSize: 16, marginTop: 4 },

  primaryButton: {
    marginTop: 14,
    backgroundColor: "#37E293",
    borderRadius: 999,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  primaryButtonText: { color: "#050508", fontSize: 16, fontWeight: "700", marginLeft: 6 },

  row: { flexDirection: "row", gap: 10, marginTop: 14 },
  smallCard: { flex: 1 },

  cardLabel: { color: "#8E8E99", fontSize: 12, marginBottom: 4 },
  cardValue: { color: "#FFFFFF", fontSize: 18, fontWeight: "600" },
  cardValueHighlight: { color: "#37E293", fontSize: 20, fontWeight: "700" },
  cardSub: { color: "#8E8E99", fontSize: 12, marginTop: 4 },
  cardDate: { color: "#666", fontSize: 11, marginTop: 6, fontWeight: "600" },

  vo2Btn: {
    marginTop: 10,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#37E293",
  },
  vo2BtnText: { color: "#050508", fontSize: 12, fontWeight: "900" },

  quickRow: { flexDirection: "row", flexWrap: "wrap", rowGap: 14, marginTop: 6 },
  quickAction: { alignItems: "center", width: "33.333%" },
  quickIcon: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#2D2C33",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
    backgroundColor: "#101018",
  },
  quickLabel: { color: "#FFFFFF", fontSize: 12, textAlign: "center" },
  aiBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, backgroundColor: "rgba(55,226,147,0.1)", borderWidth: 1, borderColor: "rgba(55,226,147,0.25)" },
  aiBadgeText: { color: "#37E293", fontSize: 10, fontWeight: "800" },
  aiObjective: { color: "rgba(255,255,255,0.55)", fontSize: 13, lineHeight: 19, marginTop: -4 },
  aiWorkoutBox: { backgroundColor: "rgba(55,226,147,0.06)", borderRadius: 10, borderWidth: 1, borderColor: "rgba(55,226,147,0.15)", padding: 12, gap: 4 },
  aiWorkoutText: { color: "#37E293", fontSize: 15, fontWeight: "800" },
  aiIntensity: { color: "rgba(55,226,147,0.6)", fontSize: 12, fontWeight: "600" },
  aiCoachBtn: { paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: "rgba(55,226,147,0.25)", justifyContent: "center" },
  aiCoachBtnText: { color: "#37E293", fontWeight: "800", fontSize: 14 },
});