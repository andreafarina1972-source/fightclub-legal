// src/screens/WorkoutItem.js
import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { t } from "../i18n";

function fmtSec(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function WorkoutItem({ workout, onStart, onEdit, onDelete }) {
  const totalRound = fmtSec(workout.round ?? 0);
  const totalRest = fmtSec(workout.rest ?? 0);

  return (
    <View style={styles.card}>
      <View style={{ flex: 1 }}>
       <Text style={styles.name}>
       {workout.name || t("workoutScreen.defaultWorkoutName", { defaultValue: "Workout" })}
        </Text>
        <Text style={styles.meta}>
               {(() => {
  const prepLbl = t("workoutScreen.labels.prep", { defaultValue: "Prep" });
  const roundLbl = t("workoutScreen.labels.round", { defaultValue: "Round" });
  const restLbl = t("workoutScreen.labels.rest", { defaultValue: "Rest" });
  const roundsLbl = t("workoutScreen.labels.rounds", { defaultValue: "Rounds" });
  const cyclesLbl = t("workoutScreen.labels.cycles", { defaultValue: "Cycles" });

  return `${prepLbl} ${workout.prep}s • ${roundLbl} ${totalRound} • ${restLbl} ${totalRest} • ${roundsLbl} ${workout.rounds} • ${cyclesLbl} ${workout.cycles}`;
})()}
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable onPress={onStart} style={styles.iconBtn}>
          <Ionicons name="play" size={20} color="#37E293" />
        </Pressable>

        <Pressable onPress={onEdit} style={styles.iconBtn}>
          <Ionicons name="create-outline" size={20} color="#7DDCFF" />
        </Pressable>

        <Pressable onPress={onDelete} style={styles.iconBtn}>
          <Ionicons name="trash" size={20} color="#FF4D4D" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1f1f1f",
    backgroundColor: "#0B0B0B",
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  name: { color: "#fff", fontWeight: "800", fontSize: 16 },
  meta: { color: "#aaa", marginTop: 6, fontSize: 12 },
  actions: { flexDirection: "row", gap: 10, marginLeft: 10 },
  iconBtn: { padding: 6 },
});
