// App.js
import React, { useEffect } from "react";
import { StatusBar } from "react-native";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import RootStackNavigator from "./src/navigation/RootStackNavigator";
import Vo2TestScreen from "./src/screens/Vo2TestScreen";
import TrainingScreen from "./src/screens/TrainingScreen";
import RunningScreen from "./src/screens/RunningScreen";

import { loadSounds } from "./src/services/soundManager";
import { Audio } from "expo-av";

import { HistoryProvider } from "./src/context/HistoryContext";
import { WorkoutProvider } from "./src/context/WorkoutContext";
import { HeartRateProvider } from "./src/context/HeartRateContext";
import { PunchProvider } from "./src/context/PunchContext";
import { SessionProvider } from "./src/context/SessionContext";
import { LanguageProvider, useLanguage } from "./src/i18n/LanguageContext";

const FightClubTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: "#050508",
    card: "#14131A",
    text: "#FFFFFF",
    border: "#2D2C33",
    primary: "#37E293",
    notification: "#F6B100",
  },
};

const Stack = createNativeStackNavigator();

function AppStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Root" component={RootStackNavigator} />
      <Stack.Screen name="Vo2Test" component={Vo2TestScreen} />
      <Stack.Screen name="Training" component={TrainingScreen} />
      <Stack.Screen name="Running" component={RunningScreen} />
    </Stack.Navigator>
  );
}

function AppInner() {
  const { lang, ready } = useLanguage();

  useEffect(() => {
    async function initAudio() {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          allowsRecordingIOS: false,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        });
        await loadSounds();
      } catch (e) {
        console.log("Errore audio:", e);
      }
    }
    initAudio();
  }, []);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <WorkoutProvider>
        <HistoryProvider>
          <SessionProvider>
            <HeartRateProvider>
              <PunchProvider>
                <StatusBar barStyle="light-content" backgroundColor="#050508" />
                <NavigationContainer theme={FightClubTheme} key={lang}>
                  <AppStack />
                </NavigationContainer>
              </PunchProvider>
            </HeartRateProvider>
          </SessionProvider>
        </HistoryProvider>
      </WorkoutProvider>
    </SafeAreaProvider>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AppInner />
    </LanguageProvider>
  );
}
