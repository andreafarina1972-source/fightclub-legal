// src/screens/TrainingScreen.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";

import { t } from "../i18n";
import { useHistoryData } from "../context/HistoryContext";
import { estimateCaloriesFromSession } from "../services/vo2Utils";

import { connectHeartRate, subscribeHeartRate, subscribeHrStatus } from "../services/heartRateService";
import CardioZonesChart from "../components/CardioZonesChart";
import { getHrMax, zonesMeta, trainingZonesMeta, initZonesAccumulator, accumulateZones } from "../services/hrZones";

function ZoneLegendsBadge({ metZones, trainZones }) {
  if ((!metZones || metZones.length === 0) && (!trainZones || trainZones.length === 0)) return null;

  return (
    <View style={styles.legendsBadge}>
      <Text style={styles.legendsBadgeTitle}>{t("trainingScreen.legendsTitle") || "Legenda zone"}</Text>

      <Text style={[styles.legendTitle, { marginTop: 10 }]}>
        {t("trainingScreen.metabolicLegend") || "Legenda zone metaboliche"}
      </Text>

      <View style={styles.legendRow}>
        {(metZones || []).map((z, idx) => {
          const key = z?.key ?? z?.id ?? String(idx);

          // ✅ traduci se esiste labelKey
          const tr = z?.labelKey ? t(z.labelKey) : null;
          const label = tr && tr !== z.labelKey ? tr : z?.label ?? z?.name ?? `Z${idx + 1}`;

          const color = z?.color ?? "rgba(255,255,255,0.25)";
          const range =
            z?.range ||
            z?.pctRange ||
            (z?.minPct != null && z?.maxPct != null ? `${z.minPct}–${z.maxPct}%` : null) ||
            (z?.min != null && z?.max != null ? `${z.min}–${z.max}` : null);

          return (
            <View key={`m-${key}`} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: color }]} />
              <Text style={styles.legendText}>
                {label}
                {range ? <Text style={styles.legendSub}> {String(range)}</Text> : null}
              </Text>
            </View>
          );
        })}
      </View>

      <Text style={[styles.legendTitle, { marginTop: 12 }]}>
        {t("trainingScreen.trainingLegend") || "Legenda zone allenamento (Z1–Z5)"}
      </Text>

      <View style={styles.legendRow}>
        {(trainZones || []).map((z, idx) => {
          const key = z?.key ?? z?.id ?? String(idx);

          // ✅ traduci se esiste labelKey
          const tr = z?.labelKey ? t(z.labelKey) : null;
          const label = tr && tr !== z.labelKey ? tr : z?.label ?? z?.name ?? `Z${idx + 1}`;

          const color = z?.color ?? "rgba(255,255,255,0.25)";
          const range =
            z?.range ||
            z?.pctRange ||
            (z?.minPct != null && z?.maxPct != null ? `${z.minPct}–${z.maxPct}%` : null) ||
            (z?.min != null && z?.max != null ? `${z.min}–${z.max}` : null);

          return (
            <View key={`t-${key}`} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: color }]} />
              <Text style={styles.legendText}>
                {label}
                {range ? <Text style={styles.legendSub}> {String(range)}</Text> : null}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function ZonesLegend({ title, zones }) {
  if (!Array.isArray(zones) || zones.length === 0) return null;

  return (
    <View style={styles.legendWrap}>
      <Text style={styles.legendTitle}>{title}</Text>
      <View style={styles.legendRow}>
        {zones.map((z, idx) => {
          const key = z?.key ?? z?.id ?? String(idx);

          // ✅ FIX: prima usava solo z.label (italiano fisso). Ora traduce labelKey.
          const tr = z?.labelKey ? t(z.labelKey) : null;
          const label = tr && tr !== z.labelKey ? tr : z?.label ?? z?.name ?? `Z${idx + 1}`;

          const color = z?.color ?? "rgba(255,255,255,0.25)";
          const range =
            z?.range ||
            z?.pctRange ||
            (z?.minPct != null && z?.maxPct != null ? `${z.minPct}–${z.maxPct}%` : null) ||
            (z?.min != null && z?.max != null ? `${z.min}–${z.max}` : null);

          return (
            <View key={`lg-${key}`} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: color }]} />
              <Text style={styles.legendText}>
                {label}
                {range ? <Text style={styles.legendSub}> {String(range)}</Text> : null}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function TrainingScreen() {
  const { addSession } = useHistoryData();

  const [running, setRunning] = useState(false);

  // HR
  const [hrStatus, setHrStatus] = useState("disconnected"); // disconnected | scanning | connected
  const [hr, setHr] = useState(null);

  // Time
  const [elapsed, setElapsed] = useState(0);
  const tickRef = useRef(null);

  // Zones
  const zonesRef = useRef(initZonesAccumulator());
  const hrMaxRef = useRef(0);
  const [zonesLive, setZonesLive] = useState(zonesRef.current);
  const [hrMax, setHrMax] = useState(0);

  const resetZones = useCallback(() => {
    zonesRef.current = initZonesAccumulator();
    setZonesLive(zonesRef.current);
  }, []);

  // HR subscription
  useEffect(() => {
    const unsub = subscribeHeartRate((bpm) => {
      const v = Number(bpm);
      if (!Number.isFinite(v) || v <= 0) return;
      setHr(Math.round(v));
      setHrStatus("connected");
    });
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, []);

  // ❤️ disconnessione reale (hardware o manuale): azzera badge e dato,
  // così l'accumulatore di zone smette di scrivere il valore stale.
  useEffect(() => {
    const unsub = subscribeHrStatus((status) => {
      if (status === "disconnected") {
        setHrStatus("disconnected");
        setHr(null);
      }
    });
    return () => { if (typeof unsub === "function") unsub(); };
  }, []);

  // tick (1s)
  useEffect(() => {
    if (!running) return;

    tickRef.current = setInterval(() => {
      setElapsed((s) => s + 1);
    }, 1000);

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, [running]);

  // accumulate zones
  const lastAccRef = useRef(Date.now());
  useEffect(() => {
    if (!running) return;

    const id = setInterval(() => {
      const now = Date.now();
      const dt = Math.max(0.2, Math.min(2, (now - lastAccRef.current) / 1000));
      lastAccRef.current = now;

      if (!hr || !hrMaxRef.current) {
        // ✅ fai avanzare comunque il tempo totale così i grafici compaiono anche prima/ senza HR
        zonesRef.current.elapsed = (zonesRef.current.elapsed || 0) + dt;
        setZonesLive({ ...zonesRef.current });
        return;
      }
      accumulateZones(zonesRef.current, hr, hrMaxRef.current);
      setZonesLive({ ...zonesRef.current });
    }, 1000);

    return () => clearInterval(id);
  }, [running, hr]);

  const hrStatusText =
    hrStatus === "connected"
      ? t("home.hrConnectedDot")
      : hrStatus === "scanning"
      ? t("home.hrScanningDot")
      : t("home.hrOffDot");

  const metZones = useMemo(() => zonesMeta(zonesLive.metabolic), [zonesLive]);
  const trainZones = useMemo(() => trainingZonesMeta(zonesLive.training), [zonesLive]);

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleStart = useCallback(async () => {
    if (running) return;

    setElapsed(0);
    resetZones();
    lastAccRef.current = Date.now();

    try {
      const v = await getHrMax();
      hrMaxRef.current = Number(v) || 0;
      setHrMax(Number(v) || 0);
    } catch {
      hrMaxRef.current = 0;
      setHrMax(0);
    }

    try {
      await activateKeepAwakeAsync();
    } catch {}

    // prova connessione HR strap (non bloccare se fallisce)
    try {
      setHrStatus("scanning");
      await connectHeartRate();
    } catch {
      setHrStatus("disconnected");
    }

    setRunning(true);
  }, [running, resetZones]);

  const stopAndAskSave = useCallback(() => {
    if (!running) return;

    setRunning(false);

    try {
      deactivateKeepAwake();
    } catch {}

    const totalSeconds = elapsed;
    if (totalSeconds < 5) return;

    Alert.alert(
      t("timerScreen.interruptedTitle") || "Sessione interrotta",
      t("timerScreen.interruptedBody") || "Vuoi salvare la sessione nello storico?",
      [
        { text: t("common.delete") || "Elimina", style: "destructive" },
        { text: t("common.cancel") || "Annulla", style: "cancel" },
        {
          text: t("common.save") || "Salva",
          onPress: () => {
            const calories = estimateCaloriesFromSession(totalSeconds, 0);

            addSession({
              id: Date.now().toString(),
              type: "training", // ✅ sessione allenamento generico
              workoutId: null,
              workoutName: "Allenamento",
              punches: 0,
              punchesByRound: [],
              avgHr: hr ?? null,
              elapsed: zonesRef.current.elapsed,
              zones: {
                hrMax: hrMaxRef.current || hrMax || null,
                elapsed: zonesRef.current.elapsed,
                metabolic: { ...zonesRef.current.metabolic },
                training: { ...zonesRef.current.training },
              },
              calories,
              createdAt: new Date().toISOString(),
            });
          },
        },
      ]
    );
  }, [running, elapsed, addSession, hr, hrMax]);

  const hrBadgeValue = hr == null ? "--" : String(hr);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>{t("trainingScreen.title")}</Text>
            <Text style={styles.subTitle}>{t("trainingScreen.freeSession")}</Text>
          </View>

          {/* ✅ Badge HR fisso in alto (come le altre schermate) */}
          <View style={styles.hrBadge}>
            <Text style={styles.hrBadgeLabel}>BPM</Text>
            <Text style={styles.hrBadgeValue}>{hrBadgeValue}</Text>
            <Text style={styles.hrBadgeStatus}>{hrStatusText}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("trainingScreen.time")}</Text>
          <Text style={styles.bigValue}>{formatTime(elapsed)}</Text>
        </View>

        {(running || elapsed > 0) && (
          <View style={{ width: "100%" }}>
            <CardioZonesChart
              title={t("timerScreen.metabolicTitle", { hrMax: hrMax || "--" })}
              zones={metZones}
              totalSeconds={Math.max(1, elapsed)}
            />
            <ZonesLegend title={t("trainingScreen.metabolicLegend")} zones={metZones} />

            <CardioZonesChart title={t("timerScreen.trainingTitle")} zones={trainZones} totalSeconds={Math.max(1, elapsed)} />
            <ZonesLegend title={t("trainingScreen.trainingLegend")} zones={trainZones} />
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {!running ? (
          <Pressable style={[styles.btn, styles.btnPrimary]} onPress={handleStart}>
            <Text style={styles.btnText}>{t("start") || "START"}</Text>
          </Pressable>
        ) : (
          <Pressable style={[styles.btn, styles.btnDanger]} onPress={stopAndAskSave}>
            <Text style={styles.btnText}>{t("stop") || "STOP"}</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#050508" },
  container: { padding: 18, paddingBottom: 120, gap: 14 },

  headerRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },

  title: { color: "white", fontSize: 22, fontWeight: "900" },
  subTitle: { color: "rgba(255,255,255,0.75)", marginTop: 2 },

  // ✅ HR badge
  hrBadge: {
    minWidth: 96,
    backgroundColor: "#14131A",
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  hrBadgeLabel: { color: "rgba(255,255,255,0.55)", fontWeight: "900", fontSize: 11, letterSpacing: 1 },
  hrBadgeValue: { color: "white", fontWeight: "900", fontSize: 22, marginTop: 2 },
  hrBadgeStatus: { color: "rgba(255,255,255,0.65)", fontWeight: "800", fontSize: 12, marginTop: 2 },

  card: {
    width: "100%",
    backgroundColor: "#14131A",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    gap: 10,
  },
  cardTitle: { color: "rgba(255,255,255,0.75)", fontWeight: "800" },
  bigValue: { color: "white", fontSize: 42, fontWeight: "900" },

  legendsBadge: {
    width: "100%",
    backgroundColor: "#14131A",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    marginTop: 10,
  },
  legendsBadgeTitle: { color: "white", fontSize: 14, fontWeight: "900" },

  legendWrap: { width: "100%", marginTop: 10 },
  legendTitle: { color: "white", fontWeight: "900", fontSize: 12 },
  legendRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 999, opacity: 0.95 },
  legendText: { color: "white", fontWeight: "900", fontSize: 12 },
  legendSub: { color: "rgba(255,255,255,0.75)", fontWeight: "800", fontSize: 11 },

  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 14,
    backgroundColor: "rgba(5,5,8,0.92)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  btn: { paddingVertical: 14, borderRadius: 14, alignItems: "center" },
  btnPrimary: { backgroundColor: "#37E293" },
  btnDanger: { backgroundColor: "#E23759" },
  btnText: { color: "#f5f5f6ff", fontWeight: "900", letterSpacing: 1 },
});
