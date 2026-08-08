// src/screens/WorkoutsScreen.js
// FIX #3: usa WorkoutContext (storage unificato) invece di workoutsStorage.js
// FIX #10: naviga a "TimerRun" invece di "Timer" per evitare collisione Tab/Stack
import React, { useCallback } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from "react-native";
import GarminHeader from "../components/GarminHeader";
import { t } from "../i18n";
import WorkoutItem from "./WorkoutItem";
import { useWorkouts } from "../context/WorkoutContext";
import AdBanner from "../components/AdBanner";

export default function WorkoutsScreen({ navigation }) {
  const { workouts, removeWorkout } = useWorkouts();
  const tt = useCallback((key, fallback) => t(key, { defaultValue: fallback }), []);

  const handleStart = (workout) => {
    navigation.navigate("TimerRun", { workout });
  };

  const handleCreate = () => {
    navigation.navigate("WorkoutBuilder");
  };

  const handleDelete = (id) => {
    Alert.alert(
      tt("workoutScreen.deleteTitle", "Elimina workout"),
      tt("workoutScreen.deleteBody", "Vuoi eliminare questo workout?"),
      [
        { text: tt("common.cancel", "Annulla"), style: "cancel" },
        {
          text: tt("common.delete", "Elimina"),
          style: "destructive",
          onPress: () => removeWorkout(id),
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <GarminHeader
        title={tt("workoutScreen.title", "Workout")}
        subtitle={t("workoutScreen.subtitle")}
      />
      <View style={styles.content}>
        <TouchableOpacity style={styles.newBtn} onPress={handleCreate}>
          <Text style={styles.newText}>
            {t("workoutScreen.create") || "+ Crea nuovo workout"}
          </Text>
        </TouchableOpacity>
        {workouts.length === 0 ? (
          <Text style={styles.empty}>
            {tt("workoutScreen.empty", "Nessun workout salvato.")}
          </Text>
        ) : (
          <FlatList
            data={workouts}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => (
              <WorkoutItem
                workout={item}
                onStart={() => handleStart(item)}
                onEdit={() => navigation.navigate("WorkoutBuilder", { workout: item })}
                onDelete={() => handleDelete(item.id)}
              />
            )}
            ListFooterComponent={<AdBanner style={{ marginTop: 12 }} />}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  content: { flex: 1, padding: 16 },
  newBtn: {
    backgroundColor: "#37e293",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  newText: { color: "#000", fontWeight: "800", fontSize: 15 },
  empty: { color: "#777", marginTop: 20, fontSize: 14 },
});
