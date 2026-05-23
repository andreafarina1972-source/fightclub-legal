// src/screens/workoutsStorage.js
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "workouts_v1";

export async function getWorkouts() {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr;
    // support legacy shape: { workouts: [...] }
    if (arr && Array.isArray(arr.workouts)) return arr.workouts;
    return [];
  } catch {
    return [];
  }
}

async function saveAll(list) {
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
}

export async function upsertWorkout(workout) {
  const list = await getWorkouts();

  const now = new Date().toISOString();
  const w = {
    ...workout,
    id: workout?.id || Date.now().toString(),
    updatedAt: now,
    createdAt: workout?.createdAt || now,
  };

  const idx = list.findIndex((x) => x.id === w.id);
  if (idx >= 0) list[idx] = w;
  else list.unshift(w);

  // ordina per updatedAt desc
  list.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

  await saveAll(list);
  return w;
}

export async function deleteWorkout(id) {
  const list = await getWorkouts();
  const next = list.filter((w) => w.id !== id);
  await saveAll(next);
}

export async function resetWorkouts() {
  await AsyncStorage.removeItem(KEY);
}
