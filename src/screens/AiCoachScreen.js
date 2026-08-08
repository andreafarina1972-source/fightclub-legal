// src/screens/AiCoachScreen.js
//
// Schermata AI Coach — piano settimanale generato da Claude.
// Comprende: check-in soggettivo, generazione piano, visualizzazione sessioni.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView,
  Pressable, Alert, ActivityIndicator, Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useHistoryData } from "../context/HistoryContext";
import { computeTrainingLoad, sessionTSS } from "../services/trainingLoad";
import { computeStats } from "../services/badgeEngine";
import {
  generateAiPlan, loadAiPlan, saveCheckIn, loadCheckIns,
  isPlanCurrentWeek, getTodaySession, formatWorkoutParams,
  translateDayLabel, translateEnergySystemLabel,
} from "../services/aiCoach";
import { getAppLang } from "../services/voiceCoach";
import {
  loadAthleteProfile, computeReadiness, computePeriodization, weeklyInternalLoad,
  translatePeriodizationPhase, translateWeightCategory,
} from "../services/athleteProfile";
import ProGate from "../components/ProGate";
import { t } from "../i18n";

// ─────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────
function safeNum(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }

function sessionTypeIcon(type) {
  if (type === "running")  return "🏃";
  if (type === "rest")     return "😴";
  if (type === "recovery") return "🧊";
  return "🥊";
}
function sessionTypeColor(type) {
  if (type === "running")  return "#2D9CDB";
  if (type === "rest")     return "#555";
  if (type === "recovery") return "#9B59B6";
  return "#37E293";
}

// HR trend: confronta HR media delle ultime 5 sessioni
// con le 5 precedenti a parità di durata simile
function estimateHrTrend(sessions) {
  const sorted = [...sessions]
    .filter(s => safeNum(s.avgHr) > 0)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  if (sorted.length < 6) return null;
  const recent = sorted.slice(0, 5).map(s => safeNum(s.avgHr));
  const older  = sorted.slice(5, 10).map(s => safeNum(s.avgHr));
  if (!older.length) return null;
  const avgRecent = recent.reduce((a,b)=>a+b,0) / recent.length;
  const avgOlder  = older.reduce((a,b)=>a+b,0)  / older.length;
  return parseFloat((avgRecent - avgOlder).toFixed(1));
}

function estimateAvgFightScore(sessions) {
  const withFS = sessions
    .filter(s => safeNum(s.fightScorePeak) > 0)
    .slice(0, 5)
    .map(s => safeNum(s.fightScorePeak));
  if (!withFS.length) return null;
  return Math.round(withFS.reduce((a,b)=>a+b,0) / withFS.length);
}

function estimateVo2Trend(vo2Measurements) {
  if (!Array.isArray(vo2Measurements) || vo2Measurements.length < 2) return null;
  const sorted = [...vo2Measurements].sort((a,b) => new Date(a.date)-new Date(b.date));
  const cutoff = new Date(Date.now() - 30*86400000);
  const recent = sorted.filter(m => new Date(m.date) >= cutoff);
  if (recent.length < 1) return null;
  const first = sorted[Math.max(0, sorted.length - 4)];
  const last  = sorted[sorted.length - 1];
  return parseFloat((safeNum(last.value) - safeNum(first.value)).toFixed(1));
}

// ─────────────────────────────────────────────────────────
// CARD SESSIONE
// ─────────────────────────────────────────────────────────
function SessionCard({ session, isToday, onPress }) {
  const color = sessionTypeColor(session.type);
  const isRest = session.type === "rest" || session.type === "recovery";
  const hasDetail = (Array.isArray(session.exercises) && session.exercises.length > 0) ||
                    (Array.isArray(session.drills) && session.drills.length > 0);

  return (
    <Pressable
      onPress={hasDetail ? onPress : undefined}
      style={[scStyles.card, isToday && scStyles.cardToday, { borderColor: color + "33" }]}
    >
      {isToday && (
        <View style={[scStyles.todayBadge, { backgroundColor: color + "22", borderColor: color + "55" }]}>
          <Text style={[scStyles.todayText, { color }]}>{t("aiCoach.today") || "OGGI"}</Text>
        </View>
      )}
      <View style={scStyles.header}>
        <Text style={scStyles.icon}>{sessionTypeIcon(session.type)}</Text>
        <View style={{ flex: 1 }}>
          <Text style={scStyles.day}>{translateDayLabel(session.day)}</Text>
          <Text style={[scStyles.name, { color }]}>{session.name}</Text>
        </View>
        {session.tssEstimate > 0 && (
          <View style={scStyles.tssBadge}>
            <Text style={scStyles.tssText}>{session.tssEstimate} TSS</Text>
          </View>
        )}
      </View>

      {!isRest && session.workout && formatWorkoutParams({ ...session.workout, durationMin: session.durationMin }, session.type) ? (
        <Text style={scStyles.workout}>{formatWorkoutParams({ ...session.workout, durationMin: session.durationMin }, session.type)}</Text>
      ) : null}

      {session.energySystem ? (
        <View style={[scStyles.energyPill, { borderColor: color + "44" }]}>
          <Text style={[scStyles.energyText, { color }]}>{"\u26A1 " + translateEnergySystemLabel(session.energySystem)}</Text>
        </View>
      ) : null}

      <Text style={scStyles.objective}>
        {session.physiologicalObjective || session.objective}
      </Text>

      {Array.isArray(session.drills) && session.drills.length > 0 ? (
        <View style={scStyles.drillsBox}>
          {session.drills.map((d, i) => (
            <Text key={i} style={scStyles.drillItem}>{"\u2022 " + d}</Text>
          ))}
        </View>
      ) : null}

      {(session.intensityTarget || session.rpeTarget != null) ? (
        <View style={scStyles.intensityRow}>
          {session.intensityTarget ? (
            <>
              <Text style={scStyles.intensityLabel}>{t("aiCoach.target") || "Target"}</Text>
              <Text style={[scStyles.intensityValue, { color }]}>{session.intensityTarget}</Text>
            </>
          ) : null}
          {session.rpeTarget != null ? (
            <View style={scStyles.rpeBadge}>
              <Text style={scStyles.rpeText}>{"RPE " + session.rpeTarget}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {session.coachNote && (
        <Text style={scStyles.note}>💬 {session.coachNote}</Text>
      )}

      {hasDetail && (
        <Text style={scStyles.detailHint}>{(t("aiCoach.viewCard") || "Vedi scheda completa")} ›</Text>
      )}
    </Pressable>
  );
}

const scStyles = StyleSheet.create({
  energyPill: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, marginTop: 2 },
  energyText: { fontSize: 11, fontWeight: "800" },
  drillsBox: { gap: 3, marginTop: 2, paddingLeft: 2 },
  drillItem: { color: "rgba(255,255,255,0.6)", fontSize: 12, lineHeight: 17 },
  rpeBadge: { marginLeft: "auto", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: "rgba(255,149,0,0.12)" },
  rpeText: { color: "#FF9500", fontSize: 11, fontWeight: "800" },
  detailHint: { color: "#37E293", fontSize: 12, fontWeight: "700", marginTop: 4, alignSelf: "flex-end" },
  card: { backgroundColor: "#0D0D14", borderRadius: 14, borderWidth: 1, padding: 16, gap: 8 },
  cardToday: { backgroundColor: "#0F101C" },
  todayBadge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, borderWidth: 1, marginBottom: 4 },
  todayText: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  icon: { fontSize: 24 },
  day: { color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  name: { fontSize: 15, fontWeight: "800" },
  tssBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.06)" },
  tssText: { color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: "700" },
  workout: { color: "#37E293", fontSize: 14, fontWeight: "700" },
  objective: { color: "rgba(255,255,255,0.6)", fontSize: 13, lineHeight: 19 },
  intensityRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  intensityLabel: { color: "rgba(255,255,255,0.3)", fontSize: 11, fontWeight: "700" },
  intensityValue: { fontSize: 13, fontWeight: "800" },
  note: { color: "rgba(255,255,255,0.45)", fontSize: 12, lineHeight: 18, fontStyle: "italic" },
});

// ─────────────────────────────────────────────────────────
// CHECK-IN WIDGET
// ─────────────────────────────────────────────────────────
function CheckInWidget({ onDone }) {
  const [fatigue,  setFatigue]  = useState(3);
  const [sleep,    setSleep]    = useState(3);
  const [soreness, setSoreness] = useState("none");

  const steps = [1,2,3,4,5];

  function ScoreRow({ label, value, onChange }) {
    return (
      <View style={ciStyles.row}>
        <Text style={ciStyles.label}>{label}</Text>
        <View style={ciStyles.dots}>
          {steps.map(n => (
            <Pressable key={n} onPress={() => onChange(n)} style={[ciStyles.dot, value >= n && ciStyles.dotActive]}>
              <Text style={[ciStyles.dotText, value >= n && ciStyles.dotTextActive]}>{n}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={ciStyles.card}>
      <Text style={ciStyles.title}>{t("aiCoach.checkinTitle") || "Check-in rapido"}</Text>
      <Text style={ciStyles.sub}>{t("aiCoach.checkinSubtitle") || "Come stai oggi? (30 secondi)"}</Text>

      <ScoreRow label={t("aiCoach.fatigue") || "😴 Fatica"} value={fatigue} onChange={setFatigue} />
      <ScoreRow label={t("aiCoach.sleep") || "🌙 Sonno"} value={sleep}   onChange={setSleep} />

      <View style={ciStyles.row}>
        <Text style={ciStyles.label}>{t("aiCoach.soreness") || "💪 Dolori"}</Text>
        <View style={ciStyles.pills}>
          {[["none", t("aiCoach.sorenessNone") || "Nessuno"],["mild", t("aiCoach.sorenessMild") || "Lievi"],["severe", t("aiCoach.sorenessSevere") || "Intensi"]].map(([k,l]) => (
            <Pressable key={k} onPress={() => setSoreness(k)}
              style={[ciStyles.pill, soreness === k && ciStyles.pillActive]}>
              <Text style={[ciStyles.pillText, soreness === k && ciStyles.pillTextActive]}>{l}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Pressable style={ciStyles.btn} onPress={() => onDone({ fatigue, sleep, soreness })}>
        <Text style={ciStyles.btnText}>{t("aiCoach.generatePlanArrow") || "Genera piano →"}</Text>
      </Pressable>
    </View>
  );
}

const ciStyles = StyleSheet.create({
  card: { backgroundColor: "#0D0D14", borderRadius: 16, borderWidth: 1, borderColor: "rgba(55,226,147,0.2)", padding: 18, gap: 14 },
  title: { color: "#fff", fontSize: 17, fontWeight: "900" },
  sub:   { color: "rgba(255,255,255,0.45)", fontSize: 13, marginTop: -8 },
  row:   { gap: 8 },
  label: { color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: "700" },
  dots:  { flexDirection: "row", gap: 8 },
  dot:   { width: 36, height: 36, borderRadius: 99, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  dotActive: { backgroundColor: "rgba(55,226,147,0.15)", borderColor: "rgba(55,226,147,0.4)" },
  dotText: { color: "rgba(255,255,255,0.4)", fontSize: 14, fontWeight: "700" },
  dotTextActive: { color: "#37E293" },
  pills: { flexDirection: "row", gap: 8 },
  pill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  pillActive: { backgroundColor: "rgba(55,226,147,0.12)", borderColor: "rgba(55,226,147,0.35)" },
  pillText: { color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: "700" },
  pillTextActive: { color: "#37E293" },
  btn: { backgroundColor: "#37E293", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  btnText: { color: "#050508", fontSize: 15, fontWeight: "900" },
});

// ─────────────────────────────────────────────────────────
// SCHERMATA PRINCIPALE
// ─────────────────────────────────────────────────────────
export default function AiCoachScreen({ navigation }) {
  const { sessions, vo2Measurements } = useHistoryData();
  const [plan,       setPlan]       = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [progress,   setProgress]   = useState("");
  const [showCheckin, setShowCheckin] = useState(false);
  const [goal,       setGoal]       = useState(null);
  const [athleteProfile, setAthleteProfile] = useState(null);

  // Carica piano salvato all'avvio
  useEffect(() => {
    loadAiPlan().then(p => { if (p) setPlan(p); });
    loadAthleteProfile().then(setAthleteProfile);
  }, []);

  // Calcola dati atleta per il prompt
  const athleteData = useMemo(() => {
    const { current, weeklyTSS } = computeTrainingLoad(sessions, 90);
    const stats = computeStats(sessions, vo2Measurements);
    const sortedSessions = [...sessions].sort((a,b) => new Date(b.date)-new Date(a.date));
    const lastSession = sortedSessions[0];

    // Aderenza: sessioni nelle ultime 4 settimane / target 4*4=16
    const fourWeeksAgo = new Date(Date.now() - 28*86400000).toISOString();
    const recentCount = sessions.filter(s => (s.date||"") >= fourWeeksAgo).length;
    const adherence = Math.min(1, recentCount / 16);

    const vo2sorted = [...(vo2Measurements||[])].sort((a,b)=>new Date(b.date)-new Date(a.date));
    const vo2max = vo2sorted[0] ? safeNum(vo2sorted[0].value) : null;

    return {
      ctl:             safeNum(current.ctl),
      atl:             safeNum(current.atl),
      tsb:             safeNum(current.tsb),
      weeklyTSS:       safeNum(weeklyTSS),
      vo2max:          vo2max || null,
      vo2maxTrend:     estimateVo2Trend(vo2Measurements),
      avgFightScore:   estimateAvgFightScore(sessions),
      hrTrend:         estimateHrTrend(sessions),
      adherence,
      totalSessions:   sessions.length,
      currentStreak:   stats.currentStreak,
      lastSessionType: lastSession?.type || "boxing",
      lastSessionDate: lastSession?.date || null,
      goal:            goal || athleteProfile?.goal || null,
      profile:         athleteProfile,
      periodization:   computePeriodization(athleteProfile?.nextMatchDate || null),
      internalLoad:    weeklyInternalLoad(sessions, 7),
      lang:            getAppLang(),
    };
  }, [sessions, vo2Measurements, goal, athleteProfile]);

  const handleCheckInDone = useCallback(async (checkin) => {
    setShowCheckin(false);
    await saveCheckIn(checkin);
    const readiness = computeReadiness({
      tsb: athleteData.tsb, hrTrend: athleteData.hrTrend,
      checkIn: checkin, atl: athleteData.atl,
    });
    await doGenerate({ ...athleteData, checkIn: checkin, readiness });
  }, [athleteData]);

  const doGenerate = useCallback(async (data) => {
    setLoading(true);
    setProgress("");
    try {
      const newPlan = await generateAiPlan(data, setProgress);
      setPlan(newPlan);
    } catch (e) {
      Alert.alert(t("common.error") || "Errore", e?.message || t("aiCoach.generateError") || "Impossibile generare il piano. Controlla la connessione.");
    } finally {
      setLoading(false);
      setProgress("");
    }
  }, []);

  const handleGeneratePress = () => {
    if (sessions.length < 3) {
      Alert.alert(t("aiCoach.insufficientDataTitle") || "Dati insufficienti", t("aiCoach.insufficient") || "Completa almeno 3 sessioni prima di generare un piano AI.");
      return;
    }
    setShowCheckin(true);
  };

  // Sessione di oggi nel piano
  const todaySession = plan ? getTodaySession(plan) : null;
  const planIsCurrent = plan ? isPlanCurrentWeek(plan) : false;

  // KPI contestuali del piano
  const totalPlanTSS = plan?.sessions?.reduce((a,s) => a + safeNum(s.tssEstimate), 0) || 0;

  return (
    <ProGate title={t("aiCoach.title") || "AI Coach"} fullscreen>
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* HEADER */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>{t("aiCoach.title") || "AI Coach"}</Text>
            <Text style={styles.sub}>{t("aiCoach.subtitle") || "Piano adattivo personalizzato"}</Text>
          </View>
          <View style={styles.aiBadge}>
            <Text style={styles.aiBadgeText}>{t("aiCoach.badgeAi") || "✦ Claude AI"}</Text>
          </View>
        </View>

        {/* STATO ATLETA SINTETICO */}
        <View style={styles.kpiRow}>
          {[
            { label: t("aiCoach.kpiCtl") || "CTL", value: athleteData.ctl.toFixed(0), color: "#37E293" },
            { label: t("aiCoach.kpiTsb") || "TSB", value: athleteData.tsb > 0 ? `+${athleteData.tsb.toFixed(0)}` : athleteData.tsb.toFixed(0), color: athleteData.tsb > 0 ? "#37E293" : athleteData.tsb > -15 ? "#FF9500" : "#FF4D6D" },
            { label: t("aiCoach.kpiVo2") || "VO2", value: athleteData.vo2max ? athleteData.vo2max.toFixed(0) : "--", color: "#2D9CDB" },
            { label: t("aiCoach.kpiStreak") || "Streak", value: `${athleteData.currentStreak}${t("aiCoach.daysSuffix") || "gg"}`, color: "#FF9500" },
          ].map(k => (
            <View key={k.label} style={styles.kpiCard}>
              <Text style={[styles.kpiValue, { color: k.color }]}>{k.value}</Text>
              <Text style={styles.kpiLabel}>{k.label}</Text>
            </View>
          ))}
        </View>

        {/* PROFILO + PERIODIZZAZIONE */}
        <Pressable
          style={styles.profileBanner}
          onPress={() => navigation.navigate("AthleteProfile")}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.profileBannerLabel}>
              {(athleteData.periodization?.phase && translatePeriodizationPhase(athleteData.periodization.phase))
                || t("aiCoach.profileDefault") || "Profilo atleta"}
            </Text>
            <Text style={styles.profileBannerSub}>
              {athleteData.periodization?.weeksToMatch != null
                ? (t("aiCoach.weeksToMatch", { weeks: athleteData.periodization.weeksToMatch }) || `${athleteData.periodization.weeksToMatch} sett. al match · tocca per modificare`)
                : (athleteProfile?.weightCategory
                    ? (t("aiCoach.tapToEdit", { category: translateWeightCategory(athleteProfile.weightCategory) }) || `${translateWeightCategory(athleteProfile.weightCategory)} · tocca per modificare`)
                    : (t("aiCoach.setupProfile") || "Imposta categoria, esperienza, data match →"))}
            </Text>
          </View>
          <Text style={styles.profileBannerArrow}>›</Text>
        </Pressable>

        {/* CHECK-IN / GENERAZIONE */}
        {!loading && showCheckin && (
          <CheckInWidget onDone={handleCheckInDone} />
        )}

        {/* LOADER */}
        {loading && (
          <View style={styles.loaderCard}>
            <ActivityIndicator size="large" color="#37E293" />
            <Text style={styles.loaderText}>{progress || t("aiCoach.generating") || "Generando il piano..."}</Text>
            <Text style={styles.loaderSub}>{t("aiCoach.analyzing") || "Claude sta analizzando i tuoi dati fisiologici"}</Text>
          </View>
        )}

        {/* PIANO ATTIVO */}
        {!loading && !showCheckin && plan && (
          <>
            {/* Header piano */}
            <View style={styles.planHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.planFocus}>{plan.weekFocus}</Text>
                {!planIsCurrent && (
                  <View style={styles.oldPlanBadge}>
                    <Text style={styles.oldPlanText}>{t("aiCoach.oldPlan") || "Piano della settimana scorsa"}</Text>
                  </View>
                )}
              </View>
              <View style={styles.planTSS}>
                <Text style={styles.planTSSValue}>{totalPlanTSS}</Text>
                <Text style={styles.planTSSLabel}>{t("aiCoach.planTssLabel") || "TSS piano"}</Text>
              </View>
            </View>

            {/* Ragionamento coach (contenuto generato dall'AI, non tradotto) */}
            <View style={styles.rationaleCard}>
              <Text style={styles.rationaleIcon}>🧠</Text>
              <Text style={styles.rationaleText}>{plan.weekRationale}</Text>
            </View>

            {/* Sessioni */}
            <View style={styles.sessionsWrap}>
              {plan.sessions.map((s, i) => (
                <SessionCard
                  key={i}
                  session={s}
                  isToday={todaySession === s && planIsCurrent}
                  onPress={() => navigation.navigate("SessionDetail", { session: s })}
                />
              ))}
            </View>

            {/* Consiglio settimanale */}
            {plan.weeklyAdvice && (
              <View style={styles.adviceCard}>
                <Text style={styles.adviceTitle}>{t("aiCoach.weeklyAdviceTitle") || "💡 Consiglio della settimana"}</Text>
                <Text style={styles.adviceText}>{plan.weeklyAdvice}</Text>
              </View>
            )}

            {/* Alert TSB */}
            {plan.alertIfTSB != null && athleteData.tsb < plan.alertIfTSB && (
              <View style={styles.alertCard}>
                <Text style={styles.alertText}>
                  {t("aiCoach.tsbAlert", { tsb: athleteData.tsb.toFixed(0), threshold: plan.alertIfTSB })
                    || `⚠️ TSB attuale (${athleteData.tsb.toFixed(0)}) è sotto la soglia raccomandata (${plan.alertIfTSB}). Considera di posticipare la sessione intensa di 1-2 giorni.`}
                </Text>
              </View>
            )}

            {/* Pulsante avvia sessione di oggi */}
            {todaySession && planIsCurrent && todaySession.workout && (
              <Pressable
                style={styles.startBtn}
                onPress={() => {
                  const nav = navigation.getParent?.() || navigation;
                  nav.navigate("TimerRun", {
                    workout: { ...todaySession.workout, name: todaySession.name },
                    autoStart: true,
                  });
                }}
              >
                <Text style={styles.startBtnText}>{t("aiCoach.startTodaySession") || "▶  Avvia sessione di oggi"}</Text>
              </Pressable>
            )}

            {/* Genera nuovo piano */}
            <Pressable style={styles.regenBtn} onPress={handleGeneratePress}>
              <Text style={styles.regenBtnText}>{t("aiCoach.regeneratePlan") || "↻  Rigenera piano"}</Text>
            </Pressable>
          </>
        )}

        {/* STATO VUOTO */}
        {!loading && !showCheckin && !plan && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>🤖</Text>
            <Text style={styles.emptyTitle}>{t("aiCoach.emptyTitle") || "Il tuo coach personale"}</Text>
            <Text style={styles.emptyText}>
              {t("aiCoach.emptyText") || "L'AI analizza il tuo CTL/ATL/TSB, VO2max, Fight Score e risposta HR per generare un piano settimanale adattato esattamente al tuo stato di forma."}
            </Text>
            {sessions.length < 3 && (
              <Text style={styles.emptyHint}>
                {t("aiCoach.emptyHint", { n: sessions.length })
                  || `Completa almeno 3 sessioni per sbloccare il coach AI.\n(${sessions.length}/3 effettuate)`}
              </Text>
            )}
            <Pressable
              style={[styles.startBtn, sessions.length < 3 && { opacity: 0.4 }]}
              onPress={handleGeneratePress}
            >
              <Text style={styles.startBtnText}>{t("aiCoach.generateMyPlan") || "✦  Genera il mio piano"}</Text>
            </Pressable>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
    </ProGate>
  );
}

// ─────────────────────────────────────────────────────────
// STILI
// ─────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: "#050508" },
  scroll: { padding: 16, gap: 14, paddingBottom: 40 },

  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  title: { color: "#fff", fontSize: 24, fontWeight: "900" },
  sub:   { color: "rgba(255,255,255,0.4)", fontSize: 14, fontWeight: "600", marginTop: -4 },
  aiBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, backgroundColor: "rgba(55,226,147,0.1)", borderWidth: 1, borderColor: "rgba(55,226,147,0.3)" },
  aiBadgeText: { color: "#37E293", fontSize: 11, fontWeight: "800" },
  profileBanner: { flexDirection: "row", alignItems: "center", backgroundColor: "#0D0D14", borderRadius: 14, borderWidth: 1, borderColor: "rgba(45,156,219,0.25)", padding: 14, gap: 10 },
  profileBannerLabel: { color: "#2D9CDB", fontSize: 14, fontWeight: "800" },
  profileBannerSub: { color: "rgba(255,255,255,0.45)", fontSize: 12, marginTop: 2 },
  profileBannerArrow: { color: "rgba(255,255,255,0.3)", fontSize: 24, fontWeight: "300" },

  kpiRow: { flexDirection: "row", gap: 8 },
  kpiCard: { flex: 1, backgroundColor: "#0D0D14", borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", padding: 12, alignItems: "center", gap: 2 },
  kpiValue: { fontSize: 20, fontWeight: "900" },
  kpiLabel: { color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: "700" },

  loaderCard: { backgroundColor: "#0D0D14", borderRadius: 16, padding: 32, alignItems: "center", gap: 14, borderWidth: 1, borderColor: "rgba(55,226,147,0.15)" },
  loaderText: { color: "#37E293", fontSize: 16, fontWeight: "700" },
  loaderSub:  { color: "rgba(255,255,255,0.4)", fontSize: 13, textAlign: "center" },

  planHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  planFocus:  { color: "#fff", fontSize: 18, fontWeight: "900" },
  oldPlanBadge: { marginTop: 4, alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: "rgba(255,149,0,0.1)", borderWidth: 1, borderColor: "rgba(255,149,0,0.3)" },
  oldPlanText:  { color: "#FF9500", fontSize: 11, fontWeight: "700" },
  planTSS:    { alignItems: "center", gap: 2 },
  planTSSValue: { color: "#FF9500", fontSize: 22, fontWeight: "900" },
  planTSSLabel: { color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: "700" },

  rationaleCard: { flexDirection: "row", gap: 10, backgroundColor: "#0D0D14", borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", padding: 14 },
  rationaleIcon: { fontSize: 18 },
  rationaleText: { flex: 1, color: "rgba(255,255,255,0.6)", fontSize: 13, lineHeight: 20 },

  sessionsWrap: { gap: 10 },

  adviceCard: { backgroundColor: "#0D0D14", borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,149,0,0.2)", padding: 14, gap: 6 },
  adviceTitle: { color: "#FF9500", fontSize: 13, fontWeight: "800" },
  adviceText:  { color: "rgba(255,255,255,0.55)", fontSize: 13, lineHeight: 20 },

  alertCard: { backgroundColor: "rgba(255,77,109,0.08)", borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,77,109,0.3)", padding: 14 },
  alertText:  { color: "rgba(255,255,255,0.7)", fontSize: 13, lineHeight: 20 },

  startBtn: { backgroundColor: "#37E293", borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  startBtnText: { color: "#050508", fontSize: 16, fontWeight: "900" },

  regenBtn: { paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", alignItems: "center" },
  regenBtnText: { color: "rgba(255,255,255,0.5)", fontSize: 14, fontWeight: "700" },

  emptyCard:  { backgroundColor: "#0D0D14", borderRadius: 16, borderWidth: 1, borderColor: "rgba(55,226,147,0.1)", padding: 24, gap: 12, alignItems: "center" },
  emptyIcon:  { fontSize: 48 },
  emptyTitle: { color: "#fff", fontSize: 18, fontWeight: "900" },
  emptyText:  { color: "rgba(255,255,255,0.5)", fontSize: 13, lineHeight: 20, textAlign: "center" },
  emptyHint:  { color: "#FF9500", fontSize: 12, fontWeight: "600", textAlign: "center" },
});