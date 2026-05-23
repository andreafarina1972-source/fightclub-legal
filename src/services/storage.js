import AsyncStorage from '@react-native-async-storage/async-storage';

const WORKOUT_KEY = 'fightclub_workouts';
const SESSION_KEY = 'fightclub_sessions';

export async function getWorkouts() {
  try {
    const json = await AsyncStorage.getItem(WORKOUT_KEY);
    return json ? JSON.parse(json) : [];
  } catch (e) {
    console.warn('Errore caricando workouts', e);
    return [];
  }
}

export async function saveWorkouts(workouts) {
  try {
    await AsyncStorage.setItem(WORKOUT_KEY, JSON.stringify(workouts));
  } catch (e) {
    console.warn('Errore salvando workouts', e);
  }
}

export async function getSessions() {
  try {
    const json = await AsyncStorage.getItem(SESSION_KEY);
    return json ? JSON.parse(json) : [];
  } catch (e) {
    console.warn('Errore caricando sessions', e);
    return [];
  }
}

export async function saveSessions(sessions) {
  try {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(sessions));
  } catch (e) {
    console.warn('Errore salvando sessions', e);
  }
}
