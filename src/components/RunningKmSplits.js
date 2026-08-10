// src/components/RunningKmSplits.js
//
// Tabella "split per km" per una sessione running: tempo impiegato e HR
// massima toccata in ogni km pieno completato, con evidenziazione dorata
// del km più veloce della sessione. Usata nello storico.

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { t } from "../i18n";

function fmtSplit(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export default function RunningKmSplits({ splits }) {
  if (!Array.isArray(splits) || splits.length === 0) return null;

  const bestSplitSec = Math.min(...splits.map((s) => s.splitSec));

  return (
    <View style={st.wrap}>
      <Text style={st.title}>{t("historyScreen.kmSplitsTitle") || "Split per km"}</Text>
      <View style={st.table}>
        {splits.map((s) => {
          const isBest = s.splitSec === bestSplitSec;
          return (
            <View key={s.km} style={[st.row, isBest && st.rowBest]}>
              <Text style={[st.km, isBest && st.kmBest]}>{s.km} km</Text>
              <Text style={[st.time, isBest && st.timeBest]}>{fmtSplit(s.splitSec)}</Text>
              <Text style={st.hr}>
                {Number.isFinite(s.hrMax) ? `HR ${Math.round(s.hrMax)} bpm` : "--"}
              </Text>
              {isBest ? <Text style={st.bestBadge}>⭐</Text> : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { marginTop: 10 },
  title: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  table: { gap: 6 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 10,
  },
  rowBest: { backgroundColor: "rgba(212,175,55,0.10)", borderColor: "#D4AF37" },
  km: { color: "rgba(255,255,255,0.6)", fontWeight: "800", fontSize: 12, width: 44 },
  kmBest: { color: "#D4AF37" },
  time: { color: "#fff", fontWeight: "900", fontSize: 14, width: 56 },
  timeBest: { color: "#D4AF37" },
  hr: { color: "rgba(255,255,255,0.45)", fontSize: 11, flex: 1 },
  bestBadge: { fontSize: 13 },
});
