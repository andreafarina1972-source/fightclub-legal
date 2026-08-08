// src/screens/SessionDetailScreen.js
//
// Scheda di lavoro completa di una seduta del piano AI.
// Mostra gli esercizi reali con serie, ripetizioni/durata, recupero, carico,
// tempo di esecuzione e cue tecnici (arricchiti dalla libreria).

import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { findExercise } from "../services/exerciseLibrary";
import { translateDayLabel, translateEnergySystemLabel } from "../services/aiCoach";
import { t } from "../i18n";

const SYSTEM_COLOR = {
  "aerobico": "#37E293",
  "soglia": "#FF9500",
  "anaerobico lattacido": "#FF4D6D",
  "alattacido/potenza": "#00E5FF",
  "recupero": "#2D9CDB",
};

function fmtRest(sec) {
  if (!sec || sec <= 0) return null;
  if (sec >= 60) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s ? m + "' " + s + '"' : m + "'";
  }
  return sec + '"';
}

function fmtDuration(sec) {
  if (!sec || sec <= 0) return null;
  const minLabel = t("sessionDetail.minSuffix") || "min";
  if (sec >= 60) {
    const m = Math.round(sec / 60);
    return m + " " + minLabel;
  }
  return sec + '"';
}

// Riga esercizio con esecuzione arricchita dalla libreria
function ExerciseRow({ ex, index }) {
  const lib = findExercise(ex.name);
  const rest = fmtRest(ex.restSec);
  const dur = fmtDuration(ex.durationSec);

  // Dosaggio: "4 x 6-8" oppure "3 x 40s"
  let dose = "";
  if (ex.sets && (ex.reps || ex.reps === 0)) {
    dose = ex.sets + " x " + ex.reps;
  } else if (ex.sets && ex.durationSec) {
    dose = ex.sets + " x " + dur;
  } else if (ex.reps) {
    dose = String(ex.reps);
  } else if (dur) {
    dose = dur;
  }

  return (
    <View style={styles.exRow}>
      <View style={styles.exNumWrap}>
        <Text style={styles.exNum}>{index + 1}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.exName}>{lib?.name || ex.name}</Text>

        <View style={styles.exMetaRow}>
          {dose ? <Text style={styles.exDose}>{dose}</Text> : null}
          {ex.load ? <Text style={styles.exLoad}>{ex.load}</Text> : null}
          {rest ? <Text style={styles.exRest}>{(t("sessionDetail.restPrefix") || "rec") + " " + rest}</Text> : null}
          {lib?.tempo === "explosive"
            ? <Text style={styles.exTempoExpl}>{t("sessionDetail.explosive") || "esplosivo"}</Text>
            : lib?.tempo === "slow"
            ? <Text style={styles.exTempo}>{t("sessionDetail.controlled") || "controllato"}</Text>
            : lib?.tempo
            ? <Text style={styles.exTempo}>{(t("sessionDetail.tempoPrefix") || "tempo") + " " + lib.tempo}</Text>
            : null}
        </View>

        {lib?.cues ? <Text style={styles.exCues}>{lib.cues}</Text> : null}
        {ex.notes ? <Text style={styles.exNotes}>{(t("sessionDetail.notePrefix") || "Nota") + ": " + ex.notes}</Text> : null}
      </View>
    </View>
  );
}

export default function SessionDetailScreen({ route }) {
  const session = route?.params?.session || {};
  const color = SYSTEM_COLOR[session.energySystem] || "#37E293";
  const exercises = Array.isArray(session.exercises) ? session.exercises : [];

  const hasRounds = session.workout && session.workout.rounds > 0;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Intestazione */}
        <Text style={styles.day}>{translateDayLabel(session.day)}</Text>
        <Text style={styles.name}>{session.name}</Text>

        {session.energySystem ? (
          <View style={[styles.pill, { borderColor: color + "55" }]}>
            <Text style={[styles.pillText, { color }]}>{translateEnergySystemLabel(session.energySystem)}</Text>
          </View>
        ) : null}

        {session.physiologicalObjective ? (
          <Text style={styles.objective}>{session.physiologicalObjective}</Text>
        ) : null}

        {/* Parametri sintetici */}
        <View style={styles.paramCard}>
          {hasRounds ? (
            <View style={styles.paramItem}>
              <Text style={styles.paramLabel}>{t("sessionDetail.round") || "Round"}</Text>
              <Text style={styles.paramValue}>
                {session.workout.rounds} x {Math.round((session.workout.round || 0) / 60)}'
              </Text>
            </View>
          ) : null}
          {session.workout?.durationMin ? (
            <View style={styles.paramItem}>
              <Text style={styles.paramLabel}>{t("sessionDetail.duration") || "Durata"}</Text>
              <Text style={styles.paramValue}>{session.workout.durationMin} {t("sessionDetail.minSuffix") || "min"}</Text>
            </View>
          ) : null}
          {session.intensityTarget ? (
            <View style={styles.paramItem}>
              <Text style={styles.paramLabel}>{t("sessionDetail.intensity") || "Intensita'"}</Text>
              <Text style={[styles.paramValue, { color }]}>{session.intensityTarget}</Text>
            </View>
          ) : null}
          {session.rpeTarget != null ? (
            <View style={styles.paramItem}>
              <Text style={styles.paramLabel}>{t("sessionDetail.rpe") || "RPE"}</Text>
              <Text style={[styles.paramValue, { color: "#FF9500" }]}>{session.rpeTarget}</Text>
            </View>
          ) : null}
        </View>

        {/* Drill boxe (se presenti) */}
        {Array.isArray(session.drills) && session.drills.length > 0 ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>{t("sessionDetail.technicalWork") || "Lavoro tecnico"}</Text>
            {session.drills.map((d, i) => (
              <Text key={i} style={styles.drill}>• {d}</Text>
            ))}
          </View>
        ) : null}

        {/* Scheda esercizi */}
        {exercises.length > 0 ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>{t("sessionDetail.workoutCard") || "Scheda di lavoro"}</Text>
            {exercises.map((ex, i) => (
              <ExerciseRow key={i} ex={ex} index={i} />
            ))}
          </View>
        ) : null}

        {/* Nota coach */}
        {session.coachNote ? (
          <View style={styles.coachCard}>
            <Text style={styles.coachText}>{session.coachNote}</Text>
          </View>
        ) : null}

        {exercises.length === 0 && (!session.drills || session.drills.length === 0) ? (
          <Text style={styles.empty}>
            {t("sessionDetail.empty") || "Questa seduta non ha una scheda dettagliata. Rigenera il piano per ottenere gli esercizi."}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: "#050508" },
  scroll: { padding: 16, gap: 10, paddingBottom: 40 },

  day:    { color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: "700", letterSpacing: 1 },
  name:   { color: "#fff", fontSize: 24, fontWeight: "900", marginTop: -2 },

  pill:     { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, marginTop: 4 },
  pillText: { fontSize: 12, fontWeight: "800" },

  objective: { color: "rgba(255,255,255,0.7)", fontSize: 14, lineHeight: 20, marginTop: 4 },

  paramCard: { flexDirection: "row", flexWrap: "wrap", gap: 16, backgroundColor: "#0D0D14", borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", padding: 14, marginTop: 4 },
  paramItem: { minWidth: 70 },
  paramLabel:{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: "700", marginBottom: 2 },
  paramValue:{ color: "#fff", fontSize: 15, fontWeight: "800" },

  block:     { backgroundColor: "#0D0D14", borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", padding: 14, gap: 10 },
  blockTitle:{ color: "#37E293", fontSize: 13, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" },
  drill:     { color: "rgba(255,255,255,0.75)", fontSize: 14, lineHeight: 20 },

  exRow:     { flexDirection: "row", gap: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.05)" },
  exNumWrap: { width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(55,226,147,0.14)", alignItems: "center", justifyContent: "center", marginTop: 2 },
  exNum:     { color: "#37E293", fontSize: 13, fontWeight: "900" },
  exName:    { color: "#fff", fontSize: 15, fontWeight: "700" },
  exMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4, alignItems: "center" },
  exDose:    { color: "#fff", fontSize: 13, fontWeight: "800", backgroundColor: "rgba(255,255,255,0.08)", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  exLoad:    { color: "#00E5FF", fontSize: 12, fontWeight: "700" },
  exRest:    { color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: "600" },
  exTempo:   { color: "#FF9500", fontSize: 12, fontWeight: "700" },
  exTempoExpl:{ color: "#FF4D6D", fontSize: 12, fontWeight: "700" },
  exCues:    { color: "rgba(255,255,255,0.55)", fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  exNotes:   { color: "rgba(255,255,255,0.45)", fontSize: 12, fontStyle: "italic", marginTop: 2 },

  coachCard: { backgroundColor: "rgba(55,226,147,0.06)", borderRadius: 12, borderWidth: 1, borderColor: "rgba(55,226,147,0.15)", padding: 14 },
  coachText: { color: "rgba(255,255,255,0.75)", fontSize: 13.5, lineHeight: 20, fontStyle: "italic" },

  empty:     { color: "rgba(255,255,255,0.4)", fontSize: 13, textAlign: "center", marginTop: 20, lineHeight: 19 },
});
