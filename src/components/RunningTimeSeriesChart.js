// src/components/RunningTimeSeriesChart.js
//
// Mini grafico SVG a linea singola per l'andamento nel tempo di una
// sessione running (frequenza cardiaca o andatura), usato nello storico.
// Stesso pattern SVG inline già usato in TrainingLoadScreen.js (TrainingChart):
// nessuna libreria di grafici esterna, solo react-native-svg.

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Path, Line, Text as SvgText, Circle } from "react-native-svg";

const CHART_H = 110;

function fmtTime(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

// series: [{ t: secondiTrascorsi, value: number|null }]
export default function RunningTimeSeriesChart({ title, unit, color = "#37E293", series, width = 300 }) {
  const pts = (series || []).filter((d) => Number.isFinite(d?.value));
  if (pts.length < 2) return null;

  const W = width - 34; // margine sx per etichette Y
  const H = CHART_H;
  const PAD = 10;

  const values = pts.map((d) => d.value);
  const maxVal = Math.max(...values);
  const minVal = Math.min(0, Math.min(...values));
  const range = maxVal - minVal || 1;

  const maxT = pts[pts.length - 1].t || 1;
  function xOf(t) { return PAD + (W - 2 * PAD) * (t / maxT); }
  function yOf(v) { return PAD + (H - 2 * PAD) * (1 - (v - minVal) / range); }

  const path = pts
    .map((d, i) => `${i === 0 ? "M" : "L"}${xOf(d.t).toFixed(1)},${yOf(d.value).toFixed(1)}`)
    .join(" ");

  const last = pts[pts.length - 1];

  return (
    <View style={st.wrap}>
      {title ? <Text style={st.title}>{title}</Text> : null}
      <Svg width={width} height={H + 18}>
        <Line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
        <Path d={path} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        <Circle cx={xOf(last.t)} cy={yOf(last.value)} r={3} fill={color} />
        <SvgText x={2} y={PAD + 4} fontSize={9} fill="rgba(255,255,255,0.35)">
          {Math.round(maxVal)}
        </SvgText>
        <SvgText x={2} y={H - PAD + 4} fontSize={9} fill="rgba(255,255,255,0.35)">
          {Math.round(minVal)}
        </SvgText>
        <SvgText x={PAD} y={H + 14} fontSize={9} fill="rgba(255,255,255,0.35)">
          0:00
        </SvgText>
        <SvgText x={W - PAD} y={H + 14} fontSize={9} fill="rgba(255,255,255,0.35)" textAnchor="end">
          {fmtTime(maxT)}
        </SvgText>
      </Svg>
      {unit ? <Text style={st.unit}>{unit}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { marginTop: 4 },
  title: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  unit: { color: "rgba(255,255,255,0.35)", fontSize: 9, marginTop: -2 },
});
