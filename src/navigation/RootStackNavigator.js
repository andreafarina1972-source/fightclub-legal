// src/navigation/RootStackNavigator.js
import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import RootNavigator from "./RootNavigator";
import { t } from "../i18n";

import WorkoutBuilderScreen from "../screens/WorkoutBuilderScreen";
import CustomTimerScreen from "../screens/CustomTimerScreen";
import BluetoothScreen from "../screens/BluetoothScreen";
import PunchCalibrationScreen from "../screens/PunchCalibrationScreen";

import WorkoutRunScreen from "../screens/WorkoutRunScreen";
import TimerScreen from "../screens/TimerScreen";

// ✅ Running replay (mappa percorso dallo storico)
import RunningReplayRouteScreen from "../screens/RunningReplayRouteScreen";

import TrainingLoadScreen from "../screens/TrainingLoadScreen";
import BadgesScreen from "../screens/BadgesScreen";
import AthleteProfileScreen from "../screens/AthleteProfileScreen";
import SessionDetailScreen from "../screens/SessionDetailScreen";

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
        options={{ title: t("workoutBuilder.title") || "Crea workout" }}
      />

      <Stack.Screen
        name="CustomTimer"
        component={CustomTimerScreen}
        options={{ title: t("customTimer.title") || "Timer personalizzato" }}
      />

      {/* FIX #10: rinominato da "Timer" a "TimerRun" per evitare collisione con Tab "Timer" */}
      <Stack.Screen
        name="TimerRun"
        component={TimerScreen}
        options={{ title: t("timerScreen.title") || "Timer" }}
      />

      <Stack.Screen
        name="WorkoutRun"
        component={WorkoutRunScreen}
        options={{ title: t("trainingScreen.title") || "Allenamento" }}
      />

      <Stack.Screen
        name="Bluetooth"
        component={BluetoothScreen}
        options={{ title: t("bluetooth.title") || "Bluetooth" }}
      />

      <Stack.Screen
        name="PunchCalibration"
        component={PunchCalibrationScreen}
        options={{ title: t("punchCalib.title") || "Calibrazione colpi" }}
      />

      {/* ✅ Replay percorso Running */}
      <Stack.Screen
        name="RunningReplay"
        component={RunningReplayRouteScreen}
        options={{ title: t("replay_route") || "Replay percorso" }}
      />

      <Stack.Screen
        name="TrainingLoad"
        component={TrainingLoadScreen}
        options={{ title: t("trainingLoad.title") || "Training Load" }}
      />

      <Stack.Screen
        name="Badges"
        component={BadgesScreen}
        options={{ title: t("badges.title") || "Badge" }}
      />

      <Stack.Screen
        name="AthleteProfile"
        component={AthleteProfileScreen}
        options={{ title: t("athleteProfile.title") || "Profilo Atleta" }}
      />

      <Stack.Screen
        name="SessionDetail"
        component={SessionDetailScreen}
        options={{ title: t("sessionDetail.title") || "Scheda seduta" }}
      />
    </Stack.Navigator>
  );
}
