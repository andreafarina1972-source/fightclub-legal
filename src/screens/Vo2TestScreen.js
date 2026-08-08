// src/screens/Vo2TestScreen.js
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useHistoryData } from "../context/HistoryContext";
import ProGate from "../components/ProGate";

// ✅ i18n
import { t } from "../i18n";

/**
 * ✅ VO2 Test Screen
 * - Metodo 1: inserimento manuale VO2 max (ml/kg/min)
 * - Metodo 2: Cooper test 12 minuti (metri) -> stima VO2
 *
 * Salva in HistoryContext.addVo2Measurement() dentro vo2Measurements.
 */

function toNum(v) {
  if (typeof v !== "string") return Number(v);
  const s = v.replace(",", ".").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

// Cooper test 12 min: VO2max = (distance_m - 504.9) / 44.73
function estimateVo2FromCooper(distanceMeters) {
  const d = Number(distanceMeters);
  if (!Number.isFinite(d) || d <= 0) return NaN;
  const vo2 = (d - 504.9) / 44.73;
  return vo2;
}

// Score 0–100 su range 25–75 (come HistoryScreen)
function vo2Score(value, min = 25, max = 75) {
  const v = Number(value);
  if (!Number.isFinite(v) || max <= min) return NaN;
  const s = ((v - min) / (max - min)) * 100;
  return Math.max(0, Math.min(100, s));
}

function fmt1(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "--";
  return (Math.round(v * 10) / 10).toFixed(1);
}

export default function Vo2TestScreen({ navigation }) {
  const { addVo2Measurement, latestVo2 } = useHistoryData?.() || {};

  const [mode, setMode] = useState("manual"); // "manual" | "cooper"
  const [manualVo2, setManualVo2] = useState("");
  const [cooperMeters, setCooperMeters] = useState("");
  const [note, setNote] = useState("");

  const computedVo2 = useMemo(() => {
    if (mode === "cooper") return estimateVo2FromCooper(toNum(cooperMeters));
    return toNum(manualVo2);
  }, [mode, manualVo2, cooperMeters]);

  const computedScore = useMemo(() => {
    const s = vo2Score(computedVo2, 25, 75);
    return Number.isFinite(s) ? s : NaN;
  }, [computedVo2]);

  const handleSave = async () => {
    const value = Number(computedVo2);
    if (!Number.isFinite(value) || value <= 0) {
      Alert.alert(
        t("vo2Test.invalidTitle", { defaultValue: "Valore non valido" }),
        t("vo2Test.invalidBody", { defaultValue: "Inserisci un VO₂ max valido o una distanza Cooper corretta." })
      );
      return;
    }

    if (typeof addVo2Measurement !== "function") {
      Alert.alert(
        t("settingsScreen.error", { defaultValue: "Errore" }),
        t("vo2Test.missingFn", { defaultValue: "addVo2Measurement non è disponibile. Controlla HistoryContext." })
      );
      return;
    }

    const method = mode === "cooper" ? "cooper12" : "manual";

    await Promise.resolve(
      addVo2Measurement({
        value,
        method,
        note: note?.trim?.() || null,
      })
    );

    Alert.alert(
      t("vo2Test.savedTitle", { defaultValue: "Salvato" }),
      t("vo2Test.savedBody", { defaultValue: "VO₂ max: {{v}} ml/kg/min", v: fmt1(value) }),
      [
      {
        text: t("common.yes", { defaultValue: "OK" }),
        onPress: () => {
          if (navigation?.goBack) navigation.goBack();
        },
      },
    ]);
  };

  return (
    <ProGate title={t("vo2Test.title") || "VO2 Max"} fullscreen>
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{t("vo2Test.title", { defaultValue: "Test VO₂ max" })}</Text>

        {latestVo2?.value ? (
          <View style={styles.lastCard}>
            <Text style={styles.lastTitle}>{t("vo2Test.last", { defaultValue: "Ultima misurazione" })}</Text>
            <Text style={styles.lastValue}>
              {fmt1(latestVo2.value)} <Text style={styles.lastUnit}>ml/kg/min</Text>
            </Text>
            <Text style={styles.lastMeta}>
              {latestVo2?.method ? `Metodo: ${latestVo2.method}` : ""}
              {latestVo2?.date ? `  •  ${new Date(latestVo2.date).toLocaleString()}` : ""}
            </Text>
          </View>
        ) : null}

        <View style={styles.segment}>
          <Pressable
            onPress={() => setMode("manual")}
            style={[styles.segBtn, mode === "manual" && styles.segOn]}
          >
            <Text style={[styles.segText, mode === "manual" && styles.segTextOn]}>{t("vo2Test.manual", { defaultValue: "Manuale" })}</Text>
          </Pressable>
          <Pressable
            onPress={() => setMode("cooper")}
            style={[styles.segBtn, mode === "cooper" && styles.segOn]}
          >
            <Text style={[styles.segText, mode === "cooper" && styles.segTextOn]}>{t("vo2Test.cooper", { defaultValue: "Cooper 12'" })}</Text>
          </Pressable>
        </View>

        {mode === "manual" ? (
          <View style={styles.card}>
            <Text style={styles.label}>{t("vo2Test.enterVo2", { defaultValue: "Inserisci VO₂ max (ml/kg/min)" })}</Text>
            <TextInput
              value={manualVo2}
              onChangeText={setManualVo2}
              placeholder={t("vo2Test.vo2Ph", { defaultValue: "Es: 48.5" })}
              placeholderTextColor="#666"
              keyboardType="decimal-pad"
              style={styles.input}
            />
            <Text style={styles.help}>
              {t("vo2Test.vo2Help", { defaultValue: "Inserisci il valore misurato/stimato. Usa punto o virgola." })}
            </Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.label}>{t("vo2Test.cooperLabel", { defaultValue: "Cooper test: distanza in 12 minuti (metri)" })}</Text>
            <TextInput
              value={cooperMeters}
              onChangeText={setCooperMeters}
              placeholder={t("vo2Test.cooperPh", { defaultValue: "Es: 2600" })}
              placeholderTextColor="#666"
              keyboardType="number-pad"
              style={styles.input}
            />
            <Text style={styles.help}>
              {t("vo2Test.cooperHelp", { defaultValue: "Inserisci i metri percorsi in 12 minuti. Calcoleremo una stima del VO₂ max." })}
            </Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.label}>{t("vo2Test.result", { defaultValue: "Risultato" })}</Text>
          <View style={styles.resultRow}>
            <Text style={styles.resultValue}>{fmt1(computedVo2)}</Text>
            <Text style={styles.resultUnit}>ml/kg/min</Text>
          </View>

          <View style={styles.scoreRow}>
            <Text style={styles.scoreLabel}>{t("vo2Test.score", { defaultValue: "Valutazione numerica" })}</Text>
            <View style={styles.scorePill}>
              <Text style={styles.scoreText}>
                {Number.isFinite(computedScore) ? `${Math.round(computedScore)}/100` : "--/100"}
              </Text>
            </View>
          </View>

          <Text style={styles.helpSmall}>
            {t("vo2Test.scoreHelp", { defaultValue: "Score basato sul range 25–75 (25=0, 75=100)." })}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>{t("vo2Test.note", { defaultValue: "Note (opzionale)" })}</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={t("vo2Test.notePh", { defaultValue: "Es: corsa outdoor, scarpe nuove..." })}
            placeholderTextColor="#666"
            style={[styles.input, { height: 90, textAlignVertical: "top" }]}
            multiline
          />
        </View>

        <View style={styles.actions}>
          <Pressable style={[styles.btn, styles.saveBtn]} onPress={handleSave}>
            <Text style={styles.saveText}>{t("vo2Test.save", { defaultValue: "Salva misurazione" })}</Text>
          </Pressable>

          <Pressable
            style={[styles.btn, styles.cancelBtn]}
            onPress={() => (navigation?.goBack ? navigation.goBack() : null)}
          >
            <Text style={styles.cancelText}>{t("common.cancel", { defaultValue: "Indietro" })}</Text>
          </Pressable>
        </View>

        <Text style={styles.footer}>
          {t("vo2Test.footer", { defaultValue: "Dopo il salvataggio, la misurazione appare nello storico (VO₂ max) con grafico e trend." })}
        </Text>
      </ScrollView>
    </SafeAreaView>
    </ProGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#000" },
  scroll: { padding: 16, paddingBottom: 40 },

  title: { color: "#fff", fontSize: 22, fontWeight: "900", marginBottom: 12 },

  lastCard: {
    backgroundColor: "#0b0b10",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#1e1e25",
    marginBottom: 12,
  },
  lastTitle: { color: "#aaa", fontWeight: "800", marginBottom: 6 },
  lastValue: { color: "#37E293", fontSize: 22, fontWeight: "900" },
  lastUnit: { color: "#777", fontSize: 14, fontWeight: "700" },
  lastMeta: { color: "#777", marginTop: 6, fontWeight: "600" },

  segment: {
    flexDirection: "row",
    backgroundColor: "#0b0b10",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1e1e25",
    marginBottom: 12,
    overflow: "hidden",
  },
  segBtn: { flex: 1, paddingVertical: 12, alignItems: "center" },
  segOn: { backgroundColor: "#111" },
  segText: { color: "#aaa", fontWeight: "800" },
  segTextOn: { color: "#fff" },

  card: {
    backgroundColor: "#0b0b10",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#1e1e25",
    marginBottom: 12,
  },
  label: { color: "#ddd", fontWeight: "800", marginBottom: 8 },
  input: {
    backgroundColor: "#050508",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#222",
    color: "#fff",
    fontWeight: "700",
  },
  help: { color: "#777", marginTop: 8, fontWeight: "600" },
  helpSmall: { color: "#666", marginTop: 8, fontWeight: "600", fontSize: 12 },

  resultRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  resultValue: { color: "#fff", fontSize: 34, fontWeight: "900" },
  resultUnit: { color: "#777", fontSize: 14, fontWeight: "800" },

  scoreRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  scoreLabel: { color: "#aaa", fontWeight: "800" },
  scorePill: {
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "#222",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  scoreText: { color: "#37E293", fontWeight: "900" },

  actions: { marginTop: 4 },
  btn: { paddingVertical: 14, borderRadius: 14, alignItems: "center", marginBottom: 10 },
  saveBtn: { backgroundColor: "#37E293" },
  cancelBtn: { backgroundColor: "#222" },
  saveText: { color: "#000", fontWeight: "900", fontSize: 16 },
  cancelText: { color: "#fff", fontWeight: "900", fontSize: 16 },

  footer: { color: "#666", marginTop: 6, fontWeight: "600", textAlign: "center" },
});
