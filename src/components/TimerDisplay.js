// src/components/TimerDisplay.js
import React from "react";
import { View, Text, StyleSheet } from "react-native";

const format = (sec) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

export default function TimerDisplay({ label, seconds, phase }) {
  return (
    <View style={styles.box}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <Text style={styles.time}>{format(seconds ?? 0)}</Text>
      {!!phase && <Text style={styles.phase}>{phase}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: "center", paddingVertical: 14 },
  label: { color: "#8E8E99", fontSize: 12, marginBottom: 6 },
  time: { color: "#fff", fontSize: 44, fontWeight: "900" },
  phase: { color: "#37E293", fontSize: 14, marginTop: 6, fontWeight: "700" },
});
