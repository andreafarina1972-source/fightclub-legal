// src/screens/CustomTimerScreen.js
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
} from "react-native";

import GarminHeader from "../components/GarminHeader";
import { t } from "../i18n";

// INPUT NUMERICO (solo cifre)
function NumberInput({ label, value, setValue, placeholder }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        value={String(value)}
        placeholder={placeholder}
        placeholderTextColor="#555"
        onChangeText={(text) => setValue(text.replace(/[^0-9]/g, ""))}
      />
    </View>
  );
}

export default function CustomTimerScreen({ navigation }) {
  // Nome (facoltativo)
  const [name, setName] = useState(t("customTimer.defaultName", { defaultValue: "Timer personalizzato" }));

  // ✅ Prep in secondi
  const [prepSec, setPrepSec] = useState("10");

  // ✅ Round/Rest/CycleRest in minuti (UI)
  const [roundMin, setRoundMin] = useState("3");
  const [restMin, setRestMin] = useState("1");
  const [cycleRestMin, setCycleRestMin] = useState("2");

  const [rounds, setRounds] = useState("3");
  const [cycles, setCycles] = useState("1");

  const startCustom = () => {
    const prep = parseInt(prepSec || "0", 10);

    const round = parseInt(roundMin || "0", 10) * 60;
    const rest = parseInt(restMin || "0", 10) * 60;
    const cycleRest = parseInt(cycleRestMin || "0", 10) * 60;

    const r = Math.max(1, parseInt(rounds || "1", 10));
    const c = Math.max(1, parseInt(cycles || "1", 10));

    if (!name.trim()) {
      Alert.alert(t("settingsScreen.error", { defaultValue: "Errore" }), t("customTimer.errName", { defaultValue: "Inserisci un nome (anche breve)." }));
      return;
    }

    if (!Number.isFinite(round) || round <= 0) {
      Alert.alert(t("settingsScreen.error", { defaultValue: "Errore" }), t("customTimer.errRound", { defaultValue: "La durata round (in minuti) deve essere > 0." }));
      return;
    }

    // workout in secondi (come vuole TimerScreen/useFightTimer)
    const workout = {
      id: null,
      name: name.trim(),
      prep: Number.isFinite(prep) ? prep : 0,
      round,
      rest: Number.isFinite(rest) ? rest : 0,
      rounds: r,
      cycles: c,
      cycleRest: Number.isFinite(cycleRest) ? cycleRest : 0,
    };

    // Vai al Timer con params
    // FIX #10: usa "TimerRun" (Stack) per navigare con params workout
    navigation.navigate("TimerRun", { workout });
  };

  return (
    <View style={styles.container}>
      <GarminHeader
        title={t("customTimer.title", { defaultValue: "Timer personalizzato" })}
        subtitle={t("customTimer.subtitle", { defaultValue: "Prep in secondi • Round/Rest in minuti" })}
      />

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Nome */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{t("customTimer.nameLabel", { defaultValue: "Nome" })}</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={t("customTimer.namePlaceholder", { defaultValue: "Es. Sacco 3x3" })}
            placeholderTextColor="#555"
          />
        </View>

        {/* Prep in secondi */}
        <NumberInput
          label={t("customTimer.prep", { defaultValue: "Preparazione (secondi)" })}
          value={prepSec}
          setValue={setPrepSec}
          placeholder="10"
        />

        {/* Round in minuti */}
        <NumberInput
          label={t("customTimer.round", { defaultValue: "Durata round (minuti)" })}
          value={roundMin}
          setValue={setRoundMin}
          placeholder="3"
        />

        {/* Rest in minuti */}
        <NumberInput
          label={t("customTimer.rest", { defaultValue: "Riposo tra round (minuti)" })}
          value={restMin}
          setValue={setRestMin}
          placeholder="1"
        />

        {/* Cycle rest in minuti */}
        <NumberInput
          label={t("customTimer.cycleRest", { defaultValue: "Riposo tra cicli (minuti)" })}
          value={cycleRestMin}
          setValue={setCycleRestMin}
          placeholder="2"
        />

        {/* Round e cicli */}
        <NumberInput
          label={t("customTimer.rounds", { defaultValue: "Numero round per ciclo" })}
          value={rounds}
          setValue={setRounds}
          placeholder="3"
        />
        <NumberInput
          label={t("customTimer.cycles", { defaultValue: "Numero cicli" })}
          value={cycles}
          setValue={setCycles}
          placeholder="1"
        />

        <TouchableOpacity style={styles.startBtn} onPress={startCustom}>
          <Text style={styles.startText}>{t("customTimer.start", { defaultValue: "AVVIA TIMER" })}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  content: { flex: 1, padding: 16 },

  field: { marginBottom: 14 },
  fieldLabel: { color: "#aaa", fontSize: 12, marginBottom: 4 },

  input: {
    backgroundColor: "#101010",
    color: "#fff",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#222",
  },

  startBtn: {
    marginTop: 16,
    backgroundColor: "#37e293",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  startText: {
    color: "#000",
    fontWeight: "700",
    fontSize: 16,
  },
});
