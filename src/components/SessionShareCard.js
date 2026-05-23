// src/components/SessionShareCard.js
//
// Componente React Native che genera una share card grafica per una sessione.
// Viene catturata con react-native-view-shot e condivisa via expo-sharing.
//
// Uso:
//   <SessionShareCard ref={cardRef} session={session} />
//   const uri = await captureRef(cardRef, { format: "png", quality: 1 });
//   await Share.share({ url: uri });   // iOS
//   await Sharing.shareAsync(uri);     // Android

import React, { forwardRef } from "react";
import { View, Text, StyleSheet } from "react-native";

// ─────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────
function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function fmt(v, decimals = 0) {
  const n = safeNum(v);
  return n === 0 ? "--" : n.toFixed(decimals);
}

function fmtTime(seconds) {
  const s = Math.round(safeNum(seconds));
  if (s <= 0) return "--";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}:${String(sec).padStart(2, "0")}`;
  return `${sec}s`;
}

function sessionDurationSec(session) {
  return (
    safeNum(session?.totalSeconds) ||
    safeNum(session?.elapsed) ||
    safeNum(session?.durationSeconds) ||
    safeNum(session?.totalMinutes) * 60
  );
}

function sessionType(session) {
  const t = (session?.type || "workout").toLowerCase();
  if (t === "running") return "running";
  return "boxing";
}

function shortDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return ""; }
}

// Zona HR dominante dalle hrZones
function dominantZone(session) {
  const zones = session?.hrZones || session?.zones || {};
  const training = zones?.training || {};
  let best = null, bestSec = 0;
  for (const [key, val] of Object.entries(training)) {
    const sec = safeNum(val);
    if (sec > bestSec) { bestSec = sec; best = key; }
  }
  const map = { z1: "Z1 Recupero", z2: "Z2 Aerobico", z3: "Z3 Soglia", z4: "Z4 Lattacido", z5: "Z5 Massimale" };
  return best ? (map[best] || best.toUpperCase()) : null;
}

// Calcola % tempo in ogni zona
function zonePercents(session) {
  const zones = session?.hrZones || session?.zones || {};
  const training = zones?.training || {};
  const elapsed = safeNum(zones?.elapsed) || sessionDurationSec(session);
  if (elapsed <= 0) return [];

  const order = ["z1", "z2", "z3", "z4", "z5"];
  const colors = { z1: "#4FC3F7", z2: "#37E293", z3: "#FFCA28", z4: "#FF9800", z5: "#FF4D6D" };
  const labels = { z1: "Z1", z2: "Z2", z3: "Z3", z4: "Z4", z5: "Z5" };

  return order
    .map((k) => ({ key: k, sec: safeNum(training[k]), color: colors[k], label: labels[k] }))
    .filter((z) => z.sec > 0)
    .map((z) => ({ ...z, pct: Math.round((z.sec / elapsed) * 100) }));
}

// ─────────────────────────────────────────────────────────
// BARRA ZONE (mini strip colorata)
// ─────────────────────────────────────────────────────────
function ZoneStrip({ zones }) {
  if (!zones || zones.length === 0) return null;
  return (
    <View style={{ flexDirection: "row", height: 6, borderRadius: 99, overflow: "hidden", width: "100%" }}>
      {zones.map((z) => (
        <View key={z.key} style={{ flex: z.pct, backgroundColor: z.color }} />
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// KPI SINGOLO
// ─────────────────────────────────────────────────────────
function KpiBlock({ label, value, unit, accent }) {
  return (
    <View style={kpiSt.wrap}>
      <View style={kpiSt.valueRow}>
        <Text style={[kpiSt.value, accent && { color: accent }]}>{value}</Text>
        {unit ? <Text style={kpiSt.unit}>{unit}</Text> : null}
      </View>
      <Text style={kpiSt.label}>{label}</Text>
    </View>
  );
}
const kpiSt = StyleSheet.create({
  wrap:     { alignItems: "center", flex: 1 },
  valueRow: { flexDirection: "row", alignItems: "flex-end", gap: 2 },
  value:    { color: "#fff", fontSize: 26, fontWeight: "900", letterSpacing: -0.5 },
  unit:     { color: "rgba(255,255,255,0.45)", fontSize: 12, fontWeight: "700", marginBottom: 4 },
  label:    { color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 },
});

// ─────────────────────────────────────────────────────────
// CARD PRINCIPALE  (forwardRef per captureRef)
// ─────────────────────────────────────────────────────────
const CARD_W = 380; // larghezza fissa per il PNG

const SessionShareCard = forwardRef(function SessionShareCard({ session }, ref) {
  if (!session) return null;

  const type       = sessionType(session);
  const isRunning  = type === "running";
  const dur        = sessionDurationSec(session);
  const punches    = safeNum(session?.punches);
  const avgHr      = safeNum(session?.avgHr);
  const calories   = safeNum(session?.calories);
  const vo2        = safeNum(session?.vo2MaxEstimate || session?.latestVo2 || 0);
  const fs         = safeNum(session?.fightScorePeak);
  const distKm     = safeNum(session?.distanceM) / 1000;
  const avgPaceSec = safeNum(session?.avgPaceSecPerKm);
  const workoutName = session?.workoutName || session?.name || (isRunning ? "Running" : "Boxing");
  const date       = shortDate(session?.date || session?.createdAt);
  const zones      = zonePercents(session);
  const domZone    = dominantZone(session);

  // Formatta pace min:ss
  function fmtPace(sec) {
    if (!sec || sec <= 0) return "--";
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  return (
    <View
      ref={ref}
      style={[cardSt.card, { width: CARD_W }]}
      collapsable={false}  // necessario per captureRef su Android
    >
      {/* SFONDO decorativo */}
      <View style={cardSt.bgAccent} />

      {/* HEADER */}
      <View style={cardSt.header}>
        <View style={cardSt.headerLeft}>
          <Text style={cardSt.appName}>FIGHTCLUB</Text>
          <Text style={cardSt.workoutName} numberOfLines={1}>{workoutName}</Text>
          <Text style={cardSt.dateText}>{date}</Text>
        </View>
        <View style={[cardSt.typeBadge, isRunning && { backgroundColor: "rgba(45,156,219,0.15)", borderColor: "rgba(45,156,219,0.3)" }]}>
          <Text style={[cardSt.typeIcon]}>{isRunning ? "🏃" : "🥊"}</Text>
          <Text style={[cardSt.typeLabel, isRunning && { color: "#2D9CDB" }]}>
            {isRunning ? "Running" : "Boxing"}
          </Text>
        </View>
      </View>

      {/* DIVIDER */}
      <View style={cardSt.divider} />

      {/* KPI PRINCIPALI */}
      <View style={cardSt.kpiRow}>
        <KpiBlock
          label="Durata"
          value={fmtTime(dur)}
          accent="#37E293"
        />
        <View style={cardSt.kpiSep} />

        {isRunning ? (
          <>
            <KpiBlock label="Distanza" value={distKm > 0 ? distKm.toFixed(2) : "--"} unit="km" />
            <View style={cardSt.kpiSep} />
            <KpiBlock label="Pace media" value={fmtPace(avgPaceSec)} unit="min/km" />
          </>
        ) : (
          <>
            <KpiBlock label="Colpi" value={punches > 0 ? punches.toLocaleString("it-IT") : "--"} />
            <View style={cardSt.kpiSep} />
            <KpiBlock label="Calorie" value={fmt(calories)} unit="kcal" />
          </>
        )}
      </View>

      {/* KPI SECONDARI */}
      <View style={cardSt.kpiRow2}>
        {avgHr > 0 && (
          <View style={cardSt.pill}>
            <Text style={cardSt.pillIcon}>❤️</Text>
            <Text style={cardSt.pillValue}>{Math.round(avgHr)}</Text>
            <Text style={cardSt.pillUnit}>bpm</Text>
          </View>
        )}
        {vo2 > 0 && (
          <View style={cardSt.pill}>
            <Text style={cardSt.pillIcon}>💨</Text>
            <Text style={cardSt.pillValue}>{vo2.toFixed(1)}</Text>
            <Text style={cardSt.pillUnit}>VO2max</Text>
          </View>
        )}
        {fs > 0 && !isRunning && (
          <View style={[cardSt.pill, { borderColor: "rgba(255,77,109,0.3)", backgroundColor: "rgba(255,77,109,0.08)" }]}>
            <Text style={cardSt.pillIcon}>⚡</Text>
            <Text style={[cardSt.pillValue, { color: "#FF4D6D" }]}>{Math.round(fs)}</Text>
            <Text style={cardSt.pillUnit}>Fight Score</Text>
          </View>
        )}
        {domZone && (
          <View style={cardSt.pill}>
            <Text style={cardSt.pillIcon}>📊</Text>
            <Text style={[cardSt.pillValue, { fontSize: 13 }]}>{domZone}</Text>
          </View>
        )}
      </View>

      {/* BARRA ZONE HR */}
      {zones.length > 0 && (
        <View style={cardSt.zonesWrap}>
          <Text style={cardSt.zonesTitle}>Zone cardio</Text>
          <ZoneStrip zones={zones} />
          <View style={cardSt.zonesLegend}>
            {zones.map((z) => (
              <View key={z.key} style={cardSt.zoneLegendItem}>
                <View style={[cardSt.zoneDot, { backgroundColor: z.color }]} />
                <Text style={cardSt.zoneLegendText}>{z.label} {z.pct}%</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* FOOTER */}
      <View style={cardSt.footer}>
        <Text style={cardSt.footerText}>fightclub.app</Text>
        <Text style={cardSt.footerHash}>#FightClub #Boxing #Training</Text>
      </View>
    </View>
  );
});

export default SessionShareCard;

// ─────────────────────────────────────────────────────────
// STILI CARD
// ─────────────────────────────────────────────────────────
const cardSt = StyleSheet.create({
  card: {
    backgroundColor: "#080810",
    borderRadius: 24,
    padding: 24,
    gap: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(55,226,147,0.15)",
  },
  bgAccent: {
    position: "absolute",
    top: -60,
    right: -60,
    width: 200,
    height: 200,
    borderRadius: 999,
    backgroundColor: "rgba(55,226,147,0.04)",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerLeft: { gap: 2, flex: 1 },
  appName: {
    color: "#37E293",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
  },
  workoutName: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  dateText: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 12,
    fontWeight: "600",
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 99,
    backgroundColor: "rgba(55,226,147,0.1)",
    borderWidth: 1,
    borderColor: "rgba(55,226,147,0.25)",
  },
  typeIcon:  { fontSize: 14 },
  typeLabel: { color: "#37E293", fontSize: 12, fontWeight: "800" },

  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.07)" },

  kpiRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 4,
  },
  kpiSep: {
    width: 1,
    height: 36,
    backgroundColor: "rgba(255,255,255,0.08)",
  },

  kpiRow2: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  pillIcon:  { fontSize: 13 },
  pillValue: { color: "#fff", fontSize: 15, fontWeight: "900" },
  pillUnit:  { color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: "700" },

  zonesWrap: { gap: 8 },
  zonesTitle: { color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  zonesLegend: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  zoneLegendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  zoneDot: { width: 7, height: 7, borderRadius: 99 },
  zoneLegendText: { color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: "700" },

  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  footerText: { color: "rgba(255,255,255,0.2)", fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  footerHash: { color: "rgba(55,226,147,0.3)", fontSize: 9, fontWeight: "700" },
});