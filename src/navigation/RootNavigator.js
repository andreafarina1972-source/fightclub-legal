// src/navigation/RootNavigator.js
import React from "react";
import * as BottomTabs from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

import { t } from "../i18n";

import HomeScreen from "../screens/HomeScreen";
import TimerScreen from "../screens/TimerScreen";
import QuickTimerScreen from "../screens/QuickTimerScreen";
import WorkoutsScreen from "../screens/WorkoutsScreen";
import TrainingScreen from "../screens/TrainingScreen";
import RunningScreen from "../screens/RunningScreen";
import HistoryScreen from "../screens/HistoryScreen";
import SettingsScreen from "../screens/SettingsScreen";

// ✅ compat: some setups may expose createBottomTabNavigator as default export
const _createTabs =
  BottomTabs?.createBottomTabNavigator ||
  BottomTabs?.default?.createBottomTabNavigator ||
  BottomTabs?.default;

if (typeof _createTabs !== "function") {
  throw new Error("Bottom tabs navigator not available. Check @react-navigation/bottom-tabs install/version.");
}

const Tab = _createTabs();

export default function RootNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: { backgroundColor: "#0B0B0B", borderTopColor: "#1f1f1f" },
        tabBarActiveTintColor: "#37E293",
        tabBarInactiveTintColor: "#777",
        tabBarIcon: ({ color, size }) => {
          const map = {
            Home: "home-outline",
            Timer: "timer-outline",
            QuickTimer: "flash-outline",
            Workouts: "barbell-outline",
            Training: "fitness-outline",
            Running: "walk-outline",
            History: "stats-chart-outline",
            Settings: "settings-outline",
          };
          return <Ionicons name={map[route.name] || "ellipse"} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: t("tabs.home") }} />
      <Tab.Screen name="Timer" component={TimerScreen} options={{ title: t("tabs.timer") }} />
      <Tab.Screen name="QuickTimer" component={QuickTimerScreen} options={{ title: t("tabs.speed") }} />
      <Tab.Screen name="Workouts" component={WorkoutsScreen} options={{ title: t("tabs.workout") }} />
      <Tab.Screen name="Training" component={TrainingScreen} options={{ title: t("tabs.training") }} />
      <Tab.Screen name="Running" component={RunningScreen} options={{ title: t("tabs.running") }} />
      <Tab.Screen name="History" component={HistoryScreen} options={{ title: t("tabs.history") }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: t("tabs.settings") }} />
    </Tab.Navigator>
  );
}
