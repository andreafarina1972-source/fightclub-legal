// src/screens/TrainingLoadScreen.js
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useHistoryData } from "../context/HistoryContext";
import { computeTrainingLoad, tsbStatus } from "../services/trainingLoad";
import { t } from "../i18n";
import ProGate from "../components/ProGate";

// ─────────────────────────────────────────────────────────
// MINI GRAFICO SVG (victory-native non serve — SVG inline)
// ─────────────────────────────────────────────────────────
import Svg, { Path, Line, Text as SvgText, Rect, Circle } from "react-native-svg";

const CHART_H = 160;
const CHART_W_FULL = 340; // calcolato dinamicamente, questo è il default

function TrainingChart({ series, width = 340 }) {
  if (!series || series.length < 2) return null;

  const W = width - 40; // margine sx per etichette
  const H = CHART_H;
  const PAD = 12;

  // Range valori
  const allCTL = series.map((d) => d.ctl);
  const allATL = series.map((d) => d.atl);
  const allTSB = series.map((d) => d.tsb);
  const maxVal = Math.max(5, ...allCTL, ...allATL);
  const minVal = Math.min(0, ...allTSB);
  const range  = maxVal - minVal || 1;

  const n = series.length;
  const xStep = W / Math.max(1, n - 1);

  function xOf(i)   { return PAD + i * xStep; }
  function yOf(v)   { return PAD + (H - 2 * PAD) * (1 - (v - minVal) / range); }
  function pathOf(key, color) {
    const pts = series.map((d, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(d[key]).toFixed(1)}`);
    return (
      <Path
        key={key}
        d={pts.join(" ")}
        stroke={color}
        strokeWidth={2}
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    );
  }

  // Linea zero TSB
  const y0 = yOf(0);

  // Tick date (ogni 2 settimane circa)
  const tickStep = Math.max(1, Math.floor(n / 5));
  const ticks = series
    .filter((_, i) => i % tickStep === 0 || i === n - 1)
    .map((d, _, arr) => ({ date: d.date.slice(5), i: series.indexOf(d) }));

  return (
    <Svg width={width} height={H + 24}>
      {/* Sfondo area TSB negativa */}
      <Rect x={PAD} y={y0} width={W} height={Math.max(0, H - PAD - y0)} fill="rgba(255,77,109,0.06)" />
      {/* Linea zero */}
      <Line x1={PAD} y1={y0} x2={PAD + W} y2={y0} stroke="rgba(255,255,255,0.12)" strokeWidth={1} strokeDasharray="4 3" />
      {/* Linee CTL, ATL, TSB */}
      {pathOf("ctl", "#37E293")}
      {pathOf("atl", "#FF4D6D")}
      {pathOf("tsb", "#2D9CDB")}
      {/* Tick asse X */}
      {ticks.map((tk) => (
        <SvgText key={tk.date} x={xOf(tk.i)} y={H + 16} fontSize={9} fill="rgba(255,255,255,0.35)" textAnchor="middle">
          {tk.date}
        </SvgText>
      ))}
      {/* Etichette Y (max, 0, min) */}
      <SvgText x={2} y={PAD + 4}  fontSize={9} fill="rgba(255,255,255,0.35)">{maxVal.toFixed(0)}</SvgText>
      <SvgText x={2} y={y0 + 4}   fontSize={9} fill="rgba(255,255,255,0.35)">0</SvgText>
      {minVal < 0 && (
        <SvgText x={2} y={H - PAD + 4} fontSize={9} fill="rgba(255,255,255,0.35)">{minVal.toFixed(0)}</SvgText>
      )}
      {/* Punto oggi */}
      <Circle cx={xOf(n - 1)} cy={yOf(series[n - 1].ctl)} r={3} fill="#37E293" />
    </Svg>
  );
}

// ─────────────────────────────────────────────────────────
// KPI CARD
// ─────────────────────────────────────────────────────────
function KpiCard({ label, value, unit, color, sub }) {
  return (
    <View style={[kpiStyles.card, { borderColor: color + "33" }]}>
      <Text style={kpiStyles.label}>{label}</Text>
      <View style={kpiStyles.valueRow}>
        <Text style={[kpiStyles.value, { color }]}>{value ?? "--"}</Text>
        {unit ? <Text style={kpiStyles.unit}>{unit}</Text> : null}
      </View>
      {sub ? <Text style={kpiStyles.sub}>{sub}</Text> : null}
    </View>
  );
}

const kpiStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: "#0D0D14",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  label: { color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  valueRow: { flexDirection: "row", alignItems: "flex-end", gap: 3 },
  value: { fontSize: 28, fontWeight: "900", letterSpacing: -1 },
  unit:  { color: "rgba(255,255,255,0.4)", fontSize: 13, fontWeight: "600", marginBottom: 3 },
  sub:   { color: "rgba(255,255,255,0.35)", fontSize: 11, fontWeight: "500" },
});

// ─────────────────────────────────────────────────────────
// BARRA CONSIGLIO (TSB interpretation)
// ─────────────────────────────────────────────────────────
function StatusBanner({ tsb }) {
  const { label, color, key } = tsbStatus(tsb);
  const advice = {
    peak:      t("trainingLoad.advice.peak")      || "Sei in forma ottimale. Ideale per gara o sparring intenso.",
    fresh:     t("trainingLoad.advice.fresh")     || "Sei fresco. Puoi aumentare il carico questa settimana.",
    load:      t("trainingLoad.advice.load")      || "Carico normale. Mantieni il ritmo e monitora il recupero.",
    fatigue:   t("trainingLoad.advice.fatigue")   || "Affaticamento medio. Inserisci una sessione di recupero attivo.",
    overreach: t("trainingLoad.advice.overreach") || "Sovrallenamento. Riduci il carico per almeno 3-4 giorni.",
    unknown:   t("trainingLoad.advice.unknown")   || "Dati insufficienti. Aggiungi sessioni per calcolare la forma.",
  };

  return (
    <View style={[bannerStyles.card, { borderColor: color + "44" }]}>
      <View style={bannerStyles.header}>
        <View style={[bannerStyles.dot, { backgroundColor: color }]} />
        <Text style={[bannerStyles.label, { color }]}>{t(`trainingLoad.status.${key}`) || label}</Text>
      </View>
      <Text style={bannerStyles.advice}>{advice[key] || advice.unknown}</Text>
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  card: {
    backgroundColor: "#0D0D14",
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 99 },
  label: { fontSize: 15, fontWeight: "800" },
  advice: { color: "rgba(255,255,255,0.65)", fontSize: 13, lineHeight: 20 },
});

// ─────────────────────────────────────────────────────────
// LEGENDA GRAFICO
// ─────────────────────────────────────────────────────────
function ChartLegend() {
  const items = [
    { color: "#37E293", label: t("trainingLoad.legend.ctl") || "CTL — Fitness (42gg)" },
    { color: "#FF4D6D", label: t("trainingLoad.legend.atl") || "ATL — Fatica (7gg)" },
    { color: "#2D9CDB", label: t("trainingLoad.legend.tsb") || "TSB — Forma (CTL - ATL)" },
  ];
  return (
    <View style={legendStyles.row}>
      {items.map((it) => (
        <View key={it.label} style={legendStyles.item}>
          <View style={[legendStyles.dot, { backgroundColor: it.color }]} />
          <Text style={legendStyles.label}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

const legendStyles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 8 },
  item: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 99 },
  label: { color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: "600" },
});

// ─────────────────────────────────────────────────────────
// SCHERMATA PRINCIPALE
// ─────────────────────────────────────────────────────────
export default function TrainingLoadScreen() {
  const { sessions } = useHistoryData();
  const [windowIdx, setWindowIdx] = useState(1); // default 90gg
  const [chartWidth, setChartWidth] = useState(340);

  const WINDOWS = [
    { label: t("trainingLoad.win4w") || "4 sett.", days: 28 },
    { label: t("trainingLoad.win3m") || "3 mesi", days: 90 },
    { label: t("trainingLoad.win6m") || "6 mesi", days: 180 },
  ];

  const { series, current, weeklyTSS, lastTSS } = useMemo(
    () => computeTrainingLoad(sessions, WINDOWS[windowIdx].days),
    [sessions, windowIdx]
  );

  const { ctl, atl, tsb } = current;
  const tsbVal = Number.isFinite(tsb) ? tsb : 0;
  const ctlRound = Math.round(ctl);
  const atlRound = Math.round(atl);
  const tsbRound = Math.round(tsbVal);
  const tsbStatus_ = tsbStatus(tsbVal);

  return (
    <ProGate title={t("trainingLoad.title") || "Training Load"} fullscreen>
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* HEADER */}
        <Text style={styles.title}>{t("trainingLoad.title") || "Training Load"}</Text>
        <Text style={styles.sub}>{t("trainingLoad.subtitle") || "Fitness · Fatica · Forma"}</Text>

        {/* SELEZIONE FINESTRA */}
        <View style={styles.windowRow}>
          {WINDOWS.map((w, i) => (
            <Pressable
              key={w.days}
              style={[styles.windowBtn, windowIdx === i && styles.windowBtnActive]}
              onPress={() => setWindowIdx(i)}
            >
              <Text style={[styles.windowBtnText, windowIdx === i && styles.windowBtnTextActive]}>
                {w.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* BANNER STATO */}
        <StatusBanner tsb={tsbVal} />

        {/* KPI PRINCIPALI */}
        <View style={styles.kpiRow}>
          <KpiCard
            label={t("trainingLoad.ctlLabel") || "CTL — Fitness"}
            value={ctlRound}
            color="#37E293"
            sub={t("trainingLoad.ctlSub") || "Media 42 giorni"}
          />
          <KpiCard
            label={t("trainingLoad.atlLabel") || "ATL — Fatica"}
            value={atlRound}
            color="#FF4D6D"
            sub={t("trainingLoad.atlSub") || "Media 7 giorni"}
          />
          <KpiCard
            label={t("trainingLoad.tsbLabel") || "TSB — Forma"}
            value={tsbRound > 0 ? `+${tsbRound}` : tsbRound}
            color={tsbStatus_.color}
            sub={t(`trainingLoad.status.${tsbStatus_.key}`) || tsbStatus_.label}
          />
        </View>

        {/* KPI SECONDARI */}
        <View style={styles.kpiRow}>
          <KpiCard
            label={t("trainingLoad.weeklyTss") || "TSS settimana"}
            value={weeklyTSS}
            color="#FF9500"
            sub={t("trainingLoad.weeklyTssSub") || "Carico 7 giorni"}
          />
          <KpiCard
            label={t("trainingLoad.lastTss") || "Ultimo TSS"}
            value={lastTSS}
            color="rgba(255,255,255,0.7)"
            sub={t("trainingLoad.lastTssSub") || "Sessione recente"}
          />
        </View>

        {/* GRAFICO */}
        <View style={styles.chartCard} onLayout={(e) => setChartWidth(e.nativeEvent.layout.width - 16)}>
          <ChartLegend />
          {series.length < 2 ? (
            <Text style={styles.empty}>
              {t("trainingLoad.chartEmpty") || "Servono almeno 2 sessioni in date diverse per visualizzare il grafico."}
            </Text>
          ) : (
            <TrainingChart series={series} width={chartWidth} />
          )}
        </View>

        {/* GUIDA INTERPRETAZIONE */}
        <View style={styles.guideCard}>
          <Text style={styles.guideTitle}>{t("trainingLoad.guideTitle") || "Come leggere i valori"}</Text>
          {[
            { color: "#37E293", label: t("trainingLoad.guideCtlLabel") || "CTL (Fitness)",  desc: t("trainingLoad.guideCtlDesc") || "Sale lentamente con settimane di allenamento costante. Obiettivo: crescita progressiva." },
            { color: "#FF4D6D", label: t("trainingLoad.guideAtlLabel") || "ATL (Fatica)",   desc: t("trainingLoad.guideAtlDesc") || "Reagisce rapidamente al carico. Alta dopo sessioni intense, scende in 1-2 giorni di riposo." },
            { color: "#2D9CDB", label: t("trainingLoad.guideTsbLabel") || "TSB (Forma)",    desc: t("trainingLoad.guideTsbDesc") || "Positivo = sei fresco. Negativo = sei affaticato. Ideale per gara: TSB tra +5 e +15." },
          ].map((g) => (
            <View key={g.label} style={styles.guideRow}>
              <View style={[styles.guideDot, { backgroundColor: g.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.guideLabel, { color: g.color }]}>{g.label}</Text>
                <Text style={styles.guideDesc}>{g.desc}</Text>
              </View>
            </View>
          ))}

          <View style={styles.guideDivider} />
          <Text style={styles.guideNote}>
            {t("trainingLoad.guideNote") || "Il TSS di ogni sessione combina: durata, intensità HR, volume colpi e Fight Score. Una sessione di 45 min in zona 4 con 200 colpi vale circa 65-75 TSS."}
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
    </ProGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#050508" },
  scroll: { padding: 16, gap: 14, paddingBottom: 40 },
  title: { color: "#fff", fontSize: 24, fontWeight: "900" },
  sub:   { color: "rgba(255,255,255,0.45)", fontSize: 14, fontWeight: "600", marginTop: -8 },

  windowRow: { flexDirection: "row", gap: 8 },
  windowBtn: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 99,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  windowBtnActive: { backgroundColor: "rgba(55,226,147,0.12)", borderColor: "rgba(55,226,147,0.35)" },
  windowBtnText: { color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: "700" },
  windowBtnTextActive: { color: "#37E293" },

  kpiRow: { flexDirection: "row", gap: 10 },

  chartCard: {
    backgroundColor: "#0D0D14",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: 14,
  },
  empty: { color: "rgba(255,255,255,0.35)", fontSize: 13, textAlign: "center", paddingVertical: 24 },

  guideCard: {
    backgroundColor: "#0D0D14",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: 16,
    gap: 12,
  },
  guideTitle: { color: "#fff", fontSize: 14, fontWeight: "800" },
  guideRow:   { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  guideDot:   { width: 8, height: 8, borderRadius: 99, marginTop: 5 },
  guideLabel: { fontSize: 13, fontWeight: "700", marginBottom: 2 },
  guideDesc:  { color: "rgba(255,255,255,0.5)", fontSize: 12, lineHeight: 18 },
  guideDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.07)" },
  guideNote: { color: "rgba(255,255,255,0.35)", fontSize: 12, lineHeight: 18 },
});