// src/context/WorkoutContext.js
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { getWorkouts, saveWorkouts } from "../services/storage";

const WorkoutContext = createContext();

export function WorkoutProvider({ children }) {
  const [workouts, setWorkouts] = useState([]);
  // FIX #8: flag per evitare sovrascrittura storage con [] al primo render
  const isLoadedRef = useRef(false);

  // Carica all'avvio
  const loadWorkouts = async () => {
    const stored = await getWorkouts();
    if (stored) setWorkouts(stored);
    isLoadedRef.current = true;
  };

  useEffect(() => {
    loadWorkouts();
  }, []);

  // Salva solo dopo che il caricamento iniziale è completato
  useEffect(() => {
    if (!isLoadedRef.current) return;
    saveWorkouts(workouts);
  }, [workouts]);

  // Aggiunta (ID già fornito da WorkoutBuilder)
  const addWorkout = (workout) => {
    setWorkouts((prev) => [...prev, workout]);
  };

  // Rimozione
  const removeWorkout = (id) => {
    setWorkouts((prev) => prev.filter((w) => w.id !== id));
  };

  // Crea o aggiorna (usato dal Workout Builder per salvare/modificare)
  const upsertWorkout = (workout) => {
    setWorkouts((prev) => {
      const idx = prev.findIndex((w) => w.id === workout.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = workout;
        return next;
      }
      return [...prev, workout];
    });
  };

  return (
    <WorkoutContext.Provider
      value={{
        workouts,
        addWorkout,
        removeWorkout,
        upsertWorkout,
        loadWorkouts,
      }}
    >
      {children}
    </WorkoutContext.Provider>
  );
}

export const useWorkouts = () => useContext(WorkoutContext);
