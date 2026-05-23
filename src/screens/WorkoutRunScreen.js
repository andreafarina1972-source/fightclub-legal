// src/screens/WorkoutRunScreen.js
// FIX: chiavi workout corrette (round/rounds invece di roundDuration/roundsPerCycle)
// FIX: sessione salvata in HistoryContext invece di SessionContext
// FIX: usa punchDetector reale invece dello stub audioPunchCounter
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import GarminHeader from '../components/GarminHeader';
import TimerDisplay from '../components/TimerDisplay';
import { t } from '../i18n';
import StatCard from '../components/StatCard';
import { useWorkouts } from '../context/WorkoutContext';
import { useHeartRate } from '../context/HeartRateContext';
import { usePunches } from '../context/PunchContext';
import { useHistoryData } from '../context/HistoryContext';
import { estimateCalories } from '../services/metrics';
// FIX VO2: usa estimateVo2Max da vo2Utils (formula Uth validata, allineata con HomeScreen)
import { estimateVo2Max } from '../services/vo2Utils';
import { startPunchDetection, stopPunchDetection } from '../services/punchDetector';

export default function WorkoutRunScreen({ route, navigation }) {
  const { workoutId } = route.params || {};
  const { workouts } = useWorkouts();
  const { heartRate } = useHeartRate();
  const { punchCount, resetPunches, incrementPunches } = usePunches();
  // FIX #13: usa HistoryContext (non SessionContext) per salvare nello storico
  const { addSession } = useHistoryData();

  const workout = workouts.find((w) => w.id === workoutId);

  const [phase, setPhase] = useState('prep');
  const [remaining, setRemaining] = useState(workout ? workout.prep : 0);
  const [round, setRound] = useState(1);
  const [cycle, setCycle] = useState(1);
  const intervalRef = useRef(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!workout) {
      Alert.alert(
        t('settingsScreen.error', { defaultValue: 'Errore' }),
        t('workoutRun.notFound', { defaultValue: 'Workout non trovato' }),
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    }
  }, [workout]);

  useEffect(() => {
    resetPunches();
    // FIX: usa punchDetector reale (non stub audioPunchCounter)
    let stopFn = () => {};
    startPunchDetection(() => incrementPunches()).then((fn) => {
      if (typeof fn === 'function') stopFn = fn;
    }).catch(() => {});

    return () => {
      clearInterval(intervalRef.current);
      stopFn();
      stopPunchDetection();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!workout) return;

    setPhase('prep');
    // FIX #2: usa workout.round (non workout.roundDuration)
    setRemaining(workout.prep || 0);
    setRound(1);
    setCycle(1);
    setElapsedSeconds(0);

    clearInterval(intervalRef.current);
    if (workout.prep > 0) {
      runPhase('prep', workout.prep, 1, 1);
    } else {
      runPhase('work', workout.round, 1, 1); // FIX: round invece di roundDuration
    }
  }, [workoutId]); // eslint-disable-line react-hooks/exhaustive-deps

  const runPhase = (newPhase, duration, roundIdx, cycleIdx) => {
    clearInterval(intervalRef.current);
    let timeLeft = Math.max(1, Number(duration) || 1);
    setPhase(newPhase);
    setRemaining(timeLeft);
    setRound(roundIdx);
    setCycle(cycleIdx);

    intervalRef.current = setInterval(() => {
      timeLeft -= 1;
      setElapsedSeconds((prev) => prev + 1);

      if (timeLeft <= 0) {
        clearInterval(intervalRef.current);
        handlePhaseEnd(newPhase, roundIdx, cycleIdx);
      } else {
        setRemaining(timeLeft);
      }
    }, 1000);
  };

  const handlePhaseEnd = (endedPhase, roundIdx, cycleIdx) => {
    if (!workout) return;

    // FIX #2: chiavi corrette: round/rounds/rest/cycleRest/cycles
    const {
      round: roundDuration,    // durata singolo round in secondi
      rounds: roundsPerCycle,  // numero di round per ciclo
      rest: restBetweenRounds, // riposo tra round
      cycles,
      cycleRest: restBetweenCycles,
    } = workout;

    if (endedPhase === 'prep') {
      if (roundsPerCycle > 0) {
        runPhase('work', roundDuration, 1, 1);
      } else {
        finishWorkout();
      }
      return;
    }

    if (endedPhase === 'work') {
      if (roundIdx < roundsPerCycle) {
        if (restBetweenRounds > 0) {
          runPhase('restRound', restBetweenRounds, roundIdx, cycleIdx);
        } else {
          runPhase('work', roundDuration, roundIdx + 1, cycleIdx);
        }
      } else {
        if (cycleIdx < cycles) {
          if (restBetweenCycles > 0) {
            runPhase('restCycle', restBetweenCycles, roundIdx, cycleIdx);
          } else {
            runPhase('work', roundDuration, 1, cycleIdx + 1);
          }
        } else {
          finishWorkout();
        }
      }
      return;
    }

    if (endedPhase === 'restRound') {
      runPhase('work', roundDuration, roundIdx + 1, cycleIdx);
      return;
    }

    if (endedPhase === 'restCycle') {
      runPhase('work', roundDuration, 1, cycleIdx + 1);
      return;
    }
  };

  const finishWorkout = () => {
    clearInterval(intervalRef.current);
    stopPunchDetection();
    setPhase('done');
    setRemaining(0);

    const durationMinutes = elapsedSeconds / 60;
    const calories = Math.round(estimateCalories(durationMinutes));
    // FIX VO2: formula Uth (15.3 × HRmax/HRrest) allineata con HomeScreen
    const vo2 = estimateVo2Max(heartRate || 130, 30, 60);

    // FIX #13: salva in HistoryContext (visibile in HomeScreen e HistoryScreen)
    addSession({
      type: 'workout',
      date: new Date().toISOString(),
      name: workout.name,
      totalMinutes: Math.round(durationMinutes),
      durationSeconds: elapsedSeconds,
      punches: punchCount,
      punchesByRound: [],
      avgHr: heartRate || null,
      calories,
      vo2MaxEstimate: vo2,
      rounds: workout.rounds,
    });

    Alert.alert(
      t('workoutRun.doneTitle', { defaultValue: 'Workout completato' }),
      t('workoutRun.doneBody', { defaultValue: 'Sessione salvata nello storico' }),
      [{ text: 'OK' }]
    );
  };

  if (!workout) {
    return null;
  }

  const phaseLabelMap = {
    prep: t('workoutRun.phasePrep', { defaultValue: 'Preparazione' }),
    work: t('quickTimer.work', { defaultValue: 'Lavoro' }),
    restRound: t('workoutRun.phaseRestRound', { defaultValue: 'Riposo round' }),
    restCycle: t('workoutRun.phaseRestCycle', { defaultValue: 'Riposo ciclo' }),
    done: t('quickTimer.done', { defaultValue: 'Finito' }),
  };

  return (
    <View style={styles.container}>
      <GarminHeader
        title={workout.name}
        subtitle={t('timerScreen.cycleRound', {
          defaultValue: 'Ciclo {{cycle}}/{{cycles}} — Round {{round}}/{{rounds}}',
          cycle,
          cycles: workout.cycles,
          round,
          rounds: workout.rounds, // FIX: rounds invece di roundsPerCycle
        })}
      />
      <View style={styles.content}>
        <TimerDisplay
          phase={phaseLabelMap[phase]}
          seconds={remaining}
          label=""
        />

        <View style={styles.statsRow}>
          <StatCard
            label={t('workoutRun.hr', { defaultValue: 'Frequenza cardiaca' })}
            value={heartRate || '--'}
            unit={heartRate ? 'bpm' : ''}
          />
          <StatCard
            label={t('workoutRun.punches', { defaultValue: 'Colpi' })}
            value={punchCount}
          />
        </View>

        <TouchableOpacity
          style={styles.stopBtn}
          onPress={() => {
            Alert.alert(
              t('workoutRun.stopTitle', { defaultValue: 'Interrompere workout?' }),
              t('workoutRun.stopBody', { defaultValue: 'La sessione non verrà salvata.' }),
              [
                { text: t('common.cancel', { defaultValue: 'Annulla' }), style: 'cancel' },
                {
                  text: t('stop', { defaultValue: 'Stop' }),
                  style: 'destructive',
                  onPress: () => {
                    clearInterval(intervalRef.current);
                    stopPunchDetection();
                    navigation.goBack();
                  },
                },
              ]
            );
          }}
        >
          <Text style={styles.stopText}>{t('stop', { defaultValue: 'STOP' })}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: { flex: 1, padding: 16 },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stopBtn: {
    marginTop: 24,
    backgroundColor: '#444',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  stopText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
