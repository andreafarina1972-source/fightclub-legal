// src/components/charts/PolarZonesBar.js
import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { formatDuration } from "../../services/hrZones";
import { t } from "../../i18n";

export default function PolarZonesBar({
  zones = { aerobic: 0, anaerobic: 0, alactic: 0 },
  showCardio = false,
  cardioSeconds = 0,
  height = 14,
}) {
  const data = useMemo(() => {
    const parts = [];

    if (showCardio)
      parts.push({
        key: "cardio",
        labelKey: "zones.metabolic.cardio",
        label: "Cardio",
        sec: cardioSeconds,
        color: "#2E7DFF",
      });

    parts.push({
      key: "aerobic",
      labelKey: "zones.metabolic.aerobicLactic",
      label: "Aerobico latt.",
      sec: zones.aerobic || 0,
      color: "#37E293",
    });

    parts.push({
      key: "anaerobic",
      labelKey: "zones.metabolic.anaerobicLactic",
      label: "Anaerobico latt.",
      sec: zones.anaerobic || 0,
      color: "#F6B100",
    });

    parts.push({
      key: "alactic",
      labelKey: "zones.metabolic.anaerobicAlactic",
      label: "Anaerobico alatt.",
      sec: zones.alactic || 0,
      color: "#FF4D4D",
    });

    const total = parts.reduce((s, p) => s + (p.sec || 0), 0);
    return { parts, total };
  }, [zones, showCardio, cardioSeconds]);

  const { parts, total } = data;

  const getLabel = (p) => {
    const k = p?.labelKey;
    if (k) {
      const tr = t(k);
      // se la traduzione non esiste, i18n-js spesso ritorna la key stessa
      if (tr && tr !== k) return tr;
    }
    return p?.label || "";
  };

  return (
    <View>
      <View style={[styles.bar, { height }]}>
        {total === 0 ? (
          <View style={[styles.seg, { flex: 1, backgroundColor: "#222" }]} />
        ) : (
          parts.map((p) => (
            <View
              key={p.key}
              style={[
                styles.seg,
                { flex: Math.max(0.0001, (p.sec || 0) / total), backgroundColor: p.color },
              ]}
            />
          ))
        )}
      </View>

      <View style={styles.legend}>
        {parts.map((p) => (
          <View key={p.key} style={styles.legItem}>
            <View style={[styles.dot, { backgroundColor: p.color }]} />
            <Text style={styles.legText}>
              {getLabel(p)} {formatDuration(p.sec || 0)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    width: "100%",
    borderRadius: 999,
    overflow: "hidden",
    flexDirection: "row",
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  seg: { height: "100%" },
  legend: { marginTop: 10, gap: 6 },
  legItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 99 },
  legText: { color: "#cfcfcf", fontSize: 12, fontWeight: "600" },
});
