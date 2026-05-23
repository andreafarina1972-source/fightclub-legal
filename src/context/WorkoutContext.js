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

  return (
    <WorkoutContext.Provider
      value={{
        workouts,
        addWorkout,
        removeWorkout,
        loadWorkouts,
      }}
    >
      {children}
    </WorkoutContext.Provider>
  );
}

export const useWorkouts = () => useContext(WorkoutContext);
