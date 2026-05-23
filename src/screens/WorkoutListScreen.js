import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import GarminHeader from '../components/GarminHeader';
import { t } from '../i18n';
import { useWorkouts } from '../context/WorkoutContext';

export default function WorkoutListScreen({ navigation }) {
  const { workouts } = useWorkouts();

  return (
    <View style={styles.container}>
      <GarminHeader
        title={t("workoutList.title", { defaultValue: "Workout salvati" })}
        subtitle={t("workoutList.subtitle", { defaultValue: "Seleziona per iniziare" })}
      />
      <View style={styles.content}>
        {workouts.length === 0 ? (
          <Text style={styles.empty}>
            {t("workoutList.empty", { defaultValue: 'Nessun workout salvato. Crea il primo dalla schermata "Crea workout".' })}
          </Text>
        ) : (
          <FlatList
            data={workouts}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.card}
                onPress={() =>
                  navigation.navigate('WorkoutRun', { workoutId: item.id })
                }
              >
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>
                  {t("workoutList.meta", { defaultValue: "Prep {{prep}}s • {{rpcs}}x{{round}}s • cicli {{cycles}}", prep: item.prep, rpcs: item.rounds, round: item.round, cycles: item.cycles })}
                </Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: { flex: 1, padding: 16 },
  empty: {
    color: '#777',
    fontSize: 14
  },
  card: {
    backgroundColor: '#101010',
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#222'
  },
  name: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600'
  },
  meta: {
    color: '#888',
    fontSize: 12,
    marginTop: 4
  }
});
