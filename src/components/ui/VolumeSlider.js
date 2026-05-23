import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Slider } from "@miblanchard/react-native-slider";

export default function VolumeSlider({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  showPercent = false, // se true mostra 0–100%
}) {
  // normalizza v che può essere number o array
  const rawValue = Array.isArray(value) ? value[0] : value;

  // clamp nel range
  const clamped = Math.min(max, Math.max(min, rawValue));

  const handleChange = (v) => {
    const raw = Array.isArray(v) ? v[0] : v;
    const safe = Math.min(max, Math.max(min, raw));
    onChange?.(safe);
  };

  const displayText = showPercent
    ? `${Math.round(((clamped - min) / (max - min)) * 100)}%`
    : `${Math.round(clamped * 100)}%`; // compatibilità vecchia (0..1)

  return (
    <View style={styles.container}>
      {!!label && <Text style={styles.label}>{label}</Text>}

      <Slider
        value={clamped}
        onValueChange={handleChange}
        minimumValue={min}
        maximumValue={max}
        step={step}
        minimumTrackTintColor="#37E293"
        maximumTrackTintColor="#444"
        thumbTintColor="#37E293"
        style={{ width: "100%" }}
      />

      <Text style={styles.valueText}>{displayText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 10 },
  label: { color: "#aaa", marginBottom: 6, fontSize: 14 },
  valueText: { color: "#fff", marginTop: 4, fontSize: 12, textAlign: "right" },
});
