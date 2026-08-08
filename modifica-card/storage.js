import AsyncStorage from '@react-native-async-storage/async-storage';

const WORKOUT_KEY = 'fightclub_workouts';
const SESSION_KEY = 'fightclub_sessions';
const SHARE_BG_KEY = 'fightclub_share_bg'; // uri immagine/gif di sfondo per la share card

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

// ─────────────────────────────────────────────────────────
// SFONDO PERSONALIZZATO SHARE CARD
// ─────────────────────────────────────────────────────────
// Salva l'uri locale (file:// o content://) dell'immagine/gif scelta
// dall'utente da usare come sfondo della fight-card condivisa.
export async function getShareBackground() {
  try {
    return await AsyncStorage.getItem(SHARE_BG_KEY);
  } catch (e) {
    console.warn('Errore caricando sfondo share card', e);
    return null;
  }
}

export async function saveShareBackground(uri) {
  try {
    if (uri) {
      await AsyncStorage.setItem(SHARE_BG_KEY, uri);
    } else {
      await AsyncStorage.removeItem(SHARE_BG_KEY);
    }
  } catch (e) {
    console.warn('Errore salvando sfondo share card', e);
  }
}

export async function clearShareBackground() {
  try {
    await AsyncStorage.removeItem(SHARE_BG_KEY);
  } catch (e) {
    console.warn('Errore rimuovendo sfondo share card', e);
  }
}
