// src/navigation/RootStackNavigator.js
import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import RootNavigator from "./RootNavigator";

import WorkoutBuilderScreen from "../screens/WorkoutBuilderScreen";
import CustomTimerScreen from "../screens/CustomTimerScreen";
import BluetoothScreen from "../screens/BluetoothScreen";
import MicScreen from "../screens/MicScreen";
import PunchCalibrationScreen from "../screens/PunchCalibrationScreen";

import WorkoutRunScreen from "../screens/WorkoutRunScreen";
import TimerScreen from "../screens/TimerScreen";

// ✅ Running replay (mappa percorso dallo storico)
import RunningReplayRouteScreen from "../screens/RunningReplayRouteScreen";

const Stack = createNativeStackNavigator();

export default function RootStackNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Root"
        component={RootNavigator}
        options={{ headerShown: false }}
      />

      <Stack.Screen
        name="WorkoutBuilder"
        component={WorkoutBuilderScreen}
        options={{ title: "Crea workout" }}
      />

      <Stack.Screen
        name="CustomTimer"
        component={CustomTimerScreen}
        options={{ title: "Timer personalizzato" }}
      />

      {/* FIX #10: rinominato da "Timer" a "TimerRun" per evitare collisione con Tab "Timer" */}
      <Stack.Screen
        name="TimerRun"
        component={TimerScreen}
        options={{ title: "Timer" }}
      />

      <Stack.Screen
        name="WorkoutRun"
        component={WorkoutRunScreen}
        options={{ title: "Allenamento" }}
      />

      <Stack.Screen
        name="Bluetooth"
        component={BluetoothScreen}
        options={{ title: "Bluetooth" }}
      />

      <Stack.Screen
        name="Mic"
        component={MicScreen}
        options={{ title: "Microfono" }}
      />

      <Stack.Screen
        name="PunchCalibration"
        component={PunchCalibrationScreen}
        options={{ title: "Calibrazione colpi" }}
      />

      {/* ✅ Replay percorso Running */}
      <Stack.Screen
        name="RunningReplay"
        component={RunningReplayRouteScreen}
        options={{ title: "Replay percorso" }}
      />
    </Stack.Navigator>
  );
}
