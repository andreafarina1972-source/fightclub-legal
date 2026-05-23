// src/screens/WorkoutBuilderScreen.js
import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView } from "react-native";
import GarminHeader from "../components/GarminHeader";

import { t } from "../i18n";
import { upsertWorkout } from "./workoutsStorage";

const toInt = (v, def) => {
  const n = Number(String(v).replace(",", "."));
  if (!Number.isFinite(n)) return def;
  return Math.round(n);
};

export default function WorkoutBuilderScreen({ navigation, route }) {
  const editing = route?.params?.workout || null;

  const initial = useMemo(() => {
    return {
      id: editing?.id,
      name: editing?.name || t("workoutScreen.defaultWorkoutName", { defaultValue: "Workout" }),
      prep: String(editing?.prep ?? 10),
      round: String(editing?.round ?? 180),
      rest: String(editing?.rest ?? 60),
      rounds: String(editing?.rounds ?? 3),
      cycles: String(editing?.cycles ?? 1),
      cycleRest: String(editing?.cycleRest ?? 120),
      createdAt: editing?.createdAt,
    };
  }, [editing]);

  const [name, setName] = useState(initial.name);
  const [prep, setPrep] = useState(initial.prep);
  const [round, setRound] = useState(initial.round);
  const [rest, setRest] = useState(initial.rest);
  const [rounds, setRounds] = useState(initial.rounds);
  const [cycles, setCycles] = useState(initial.cycles);
  const [cycleRest, setCycleRest] = useState(initial.cycleRest);

  const save = async () => {
    const w = {
      id: initial.id,
      createdAt: initial.createdAt,
      name: (name || "").trim() || t("workoutScreen.defaultWorkoutName", { defaultValue: "Workout" }),
      prep: Math.max(0, toInt(prep, 10)),
      round: Math.max(10, toInt(round, 180)),
      rest: Math.max(0, toInt(rest, 60)),
      rounds: Math.max(1, toInt(rounds, 3)),
      cycles: Math.max(1, toInt(cycles, 1)),
      cycleRest: Math.max(0, toInt(cycleRest, 120)),
    };

    await upsertWorkout(w);
    Alert.alert(
      t("workoutBuilder.savedTitle", { defaultValue: "Salvato" }),
      t("workoutBuilder.savedBody", { defaultValue: "Workout salvato correttamente." })
    );
    navigation.goBack();
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <GarminHeader
        title={t("workoutBuilder.title", { defaultValue: "Crea workout" })}
        subtitle={t("workoutBuilder.subtitle", { defaultValue: "Salva round, cicli e riposi" })}
      />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>{t("workoutBuilder.name", { defaultValue: "Nome" })}</Text>
        <TextInput value={name} onChangeText={setName} style={styles.input} placeholderTextColor="#666" />

        <Text style={styles.label}>{t("workoutBuilder.prep", { defaultValue: "Prep (sec)" })}</Text>
        <TextInput value={prep} onChangeText={setPrep} style={styles.input} keyboardType="numeric" placeholderTextColor="#666" />

        <Text style={styles.label}>{t("workoutBuilder.round", { defaultValue: "Round (sec)" })}</Text>
        <TextInput value={round} onChangeText={setRound} style={styles.input} keyboardType="numeric" placeholderTextColor="#666" />

        <Text style={styles.label}>{t("workoutBuilder.rest", { defaultValue: "Rest (sec)" })}</Text>
        <TextInput value={rest} onChangeText={setRest} style={styles.input} keyboardType="numeric" placeholderTextColor="#666" />

        <Text style={styles.label}>{t("workoutBuilder.rounds", { defaultValue: "Rounds" })}</Text>
        <TextInput value={rounds} onChangeText={setRounds} style={styles.input} keyboardType="numeric" placeholderTextColor="#666" />

        <Text style={styles.label}>{t("workoutBuilder.cycles", { defaultValue: "Cycles" })}</Text>
        <TextInput value={cycles} onChangeText={setCycles} style={styles.input} keyboardType="numeric" placeholderTextColor="#666" />

        <Text style={styles.label}>{t("workoutBuilder.cycleRest", { defaultValue: "Cycle rest (sec)" })}</Text>
        <TextInput value={cycleRest} onChangeText={setCycleRest} style={styles.input} keyboardType="numeric" placeholderTextColor="#666" />

        <TouchableOpacity style={styles.saveBtn} onPress={save}>
          <Text style={styles.saveText}>{t("common.save", { defaultValue: "SALVA" })}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  label: { color: "#aaa", marginTop: 12, marginBottom: 6, fontSize: 13 },
  input: {
    borderWidth: 1,
    borderColor: "#222",
    backgroundColor: "#0b0b0b",
    color: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  saveBtn: {
    marginTop: 18,
    backgroundColor: "#37e293",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  saveText: { color: "#000", fontWeight: "900" },
});
