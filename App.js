// App.js
import React, { useEffect, useRef, useState } from "react";
import { StatusBar } from "react-native";
import { NavigationContainer, DefaultTheme, createNavigationContainerRef } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import RootStackNavigator from "./src/navigation/RootStackNavigator";
import Vo2TestScreen from "./src/screens/Vo2TestScreen";
import TrainingScreen from "./src/screens/TrainingScreen";
import RunningScreen from "./src/screens/RunningScreen";
import AthleteCardScreen from "./src/screens/AthleteCardScreen";
import PaywallScreen from "./src/screens/PaywallScreen";

import { loadSounds } from "./src/services/soundManager";
import { Audio } from "expo-av";

import { HistoryProvider } from "./src/context/HistoryContext";
import { WorkoutProvider } from "./src/context/WorkoutContext";
import { HeartRateProvider } from "./src/context/HeartRateContext";
import { PunchProvider } from "./src/context/PunchContext";
import { SessionProvider } from "./src/context/SessionContext";
import { ProProvider } from "./src/context/ProContext";
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
const navigationRef = createNavigationContainerRef();

function AppStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Root" component={RootStackNavigator} />
      <Stack.Screen name="Vo2Test" component={Vo2TestScreen} />
      <Stack.Screen name="Training" component={TrainingScreen} />
      <Stack.Screen name="Running" component={RunningScreen} />
      <Stack.Screen
        name="Paywall"
        component={PaywallScreen}
        options={{ headerShown: false, presentation: "modal" }}
      />
    </Stack.Navigator>
  );
}

function AppInner() {
  const { lang, ready } = useLanguage();
  const [entered, setEntered] = useState(false);
  const pendingPaywallRef = useRef(false);

  const requestProFromCard = () => {
    pendingPaywallRef.current = true;
    setEntered(true);
  };

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
      <ProProvider>
        <WorkoutProvider>
          <HistoryProvider>
            <SessionProvider>
              <HeartRateProvider>
                <PunchProvider>
                  <StatusBar barStyle="light-content" backgroundColor="#050508" />
                  {!entered ? (
                    <AthleteCardScreen
                      onEnter={() => setEntered(true)}
                      onRequestPro={requestProFromCard}
                    />
                  ) : (
                    <NavigationContainer
                      ref={navigationRef}
                      theme={FightClubTheme}
                      key={lang}
                      onReady={() => {
                        if (pendingPaywallRef.current) {
                          pendingPaywallRef.current = false;
                          navigationRef.current?.navigate("Paywall");
                        }
                      }}
                    >
                      <AppStack />
                    </NavigationContainer>
                  )}
                </PunchProvider>
              </HeartRateProvider>
            </SessionProvider>
          </HistoryProvider>
        </WorkoutProvider>
      </ProProvider>
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
