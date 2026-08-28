// src/screens/HistoryScreen.js
import React, { useMemo, useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Svg, Polyline, Line, Circle, Text as SvgText } from "react-native-svg";
import { t } from "../i18n";

import CardioZonesChart from "../components/CardioZonesChart";
import { zonesMeta, trainingZonesMeta } from "../services/hrZones";
import { useHistoryData } from "../context/HistoryContext";
import { useRpePrompt } from "../context/RpePromptContext";
import { isWithinRpeWindow } from "../services/rpeWindow";
import SessionShareCard from "../components/SessionShareCard";
import ShareCardPreviewModal from "../components/ShareCardPreviewModal";
import { useShareSession } from "../hooks/useShareSession";
import { useShareBackground } from "../hooks/useShareBackground";
import { usePro } from "../context/ProContext";
import ProGate from "../components/ProGate";
import AdBanner from "../components/AdBanner";
import RunningKmSplits from "../components/RunningKmSplits";
import RunningTimeSeriesChart from "../components/RunningTimeSeriesChart";
import { getKmSplitsForSession, getTimeSeriesForSession } from "../services/runningSplits";

// ✅ Etichette zone: tradotte + forza a capo per testi lunghi
// Nota: mantiene compatibilità se hrZones non espone ancora labelKey
function wrapZoneLabel(label, labelKey) {
  const s = String(label || "").trim();

  // Caso "lattacido": va a capo sulla prima parola
  if (
    labelKey === "zones.metabolic.aerobicLactic" ||
    labelKey === "zones.metabolic.anaerobicLactic" ||
    labelKey === "zones.training.aerobicLactic" ||
    labelKey === "zones.training.anaerobicLactic"
  ) {
    // sostituisce solo il primo spazio
    return s.replace(/\s+/, "\n");
  }

  // Fallback per vecchie label italiane (se non c'è labelKey)
  const low = s.toLowerCase();
  if (low === "aerobico lattacido") return "Aerobico\nlattacido";
  if (low === "anaerobico lattacido") return "Anaerobico\nlattacido";

  return s;
}

function wrapZonesLabels(zones) {
  const arr = Array.isArray(zones) ? zones : [];
  return arr.map((z) => {
    const baseLabel = z?.labelKey ? (t(z.labelKey) || z?.label) : z?.label;
    return { ...z, label: wrapZoneLabel(baseLabel, z?.labelKey) };
  });
}


// Helpers
function fmtDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso || "";
  }
}

// sRPE (BRIEF-srpe.md, Fase 3) — etichetta verbale per il numero Borg CR10,
// stesse fasce del legend mostrato in RpePromptModal.js (0-1/2-3/4-5/6-7/
// 8-9/10). Non un numero nudo: "7 · Impegnativo", non solo "7".
function rpeLabel(rpe) {
  if (rpe <= 1) return t("rpe.bandRest") || "Riposo";
  if (rpe <= 3) return t("rpe.bandLight") || "Leggero";
  if (rpe <= 5) return t("rpe.bandModerate") || "Moderato";
  if (rpe <= 7) return t("rpe.bandHard") || "Impegnativo";
  if (rpe <= 9) return t("rpe.bandVeryHard") || "Molto impegnativo";
  return t("rpe.bandMax") || "Massimale";
}

function fmtInt(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  return String(Math.round(v));
}

function fmtVo2(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "--";
  return (Math.round(v * 10) / 10).toFixed(1);
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function safeNumber(x, fallback = 0) {
  const v = Number(x);
  return Number.isFinite(v) ? v : fallback;
}

function sum(arr) {
  return (Array.isArray(arr) ? arr : []).reduce((a, b) => a + (Number(b) || 0), 0);
}

function avg(arr) {
  const a = (Array.isArray(arr) ? arr : [])
    .map((v) => safeNumber(v, 0))
    .filter((v) => Number.isFinite(v));
  if (!a.length) return 0;
  return sum(a) / a.length;
}

function median(values) {
  const a = (values || []).map((v) => safeNumber(v, 0)).sort((x, y) => x - y);
  if (!a.length) return 0;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function extractZones(obj) {
  const o = obj && typeof obj === "object" ? obj : {};
  const keys = Object.keys(o);

  const zKeys = ["z1", "z2", "z3", "z4", "z5"].filter((k) => k in o);
  if (zKeys.length >= 3) return zKeys.map((k) => safeNumber(o[k], 0));

  const maybe = keys
    .filter((k) => /^z\d+$/i.test(k))
    .sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10))
    .slice(0, 6)
    .map((k) => safeNumber(o[k], 0));

  if (maybe.length === 6) return maybe.slice(1, 6);
  if (maybe.length === 5) return maybe;

  return [0, 0, 0, 0, 0];
}

// cardio score
function cardioScoreFromZones(hrZones) {
  const elapsed = safeNumber(hrZones?.elapsed, 0);
  if (elapsed <= 0) return 0;

  const training = extractZones(hrZones?.training);
  const metabolic = extractZones(hrZones?.metabolic);

  const w = [1, 2, 3, 4, 5];

  const tTotal = sum(training);
  const mTotal = sum(metabolic);

  const tWeighted = training.reduce((acc, sec, i) => acc + sec * w[i], 0);
  const mWeighted = metabolic.reduce((acc, sec, i) => acc + sec * w[i], 0);

  const tScore = tTotal > 0 ? (tWeighted / (tTotal * 5)) * 100 : 0;
  const mScore = mTotal > 0 ? (mWeighted / (mTotal * 5)) * 100 : 0;

  const score = 0.6 * tScore + 0.4 * mScore;

  const minutes = elapsed / 60;
  const durBonus = clamp((minutes - 10) / 30, 0, 1) * 8;

  return clamp(score + durBonus, 0, 100);
}

function vo2Score01(value, min = 25, max = 75) {
  const v = Number(value);
  if (!Number.isFinite(v) || max <= min) return null;
  const s = ((v - min) / (max - min)) * 100;
  return Math.max(0, Math.min(100, s));
}

function ScoreBadge({ value }) {
  const v = Number(value);
  if (!Number.isFinite(v)) return null;

  // stile coerente con TrendBadge
  const good = v >= 70;
  const mid = v >= 45;

  const bg = good ? "#0b1a12" : mid ? "#141414" : "#2a0f0f";
  const border = good ? "#1f5a3a" : mid ? "#333" : "#7a2a2a";
  const color = good ? "#37E293" : mid ? "#ddd" : "#ff8f8f";

  return (
    <View style={[styles.trendBadge, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[styles.trendBadgeText, { color }]}>{`Score ${Math.round(v)}/100`}</Text>
    </View>
  );
}

function punchesPerRoundAvg(session) {
  const arr = Array.isArray(session?.punchesByRound) ? session.punchesByRound : null;
  if (arr && arr.length > 0) {
    const clean = arr.map((v) => Math.max(0, safeNumber(v, 0)));
    return sum(clean) / clean.length;
  }

  const total = Math.max(0, safeNumber(session?.punches, 0));
  const roundsFallback = Math.max(1, safeNumber(session?.rounds, 1));
  return total / roundsFallback;
}

function punchesScoreFromPerRound(ppr, baselinePpr) {
  const p = Math.max(0, safeNumber(ppr, 0));
  const b = Math.max(1, safeNumber(baselinePpr, 1));

  const ratio = p / b;
  const score = 50 + 50 * (ratio - 1);
  return clamp(score, 0, 100);
}

function computePerformance(session, baselinePpr) {
  // getZonesContainer (sotto) legge sia hrZones (Timer/Training/QuickTimer)
  // sia zones (RunningScreen) — senza, il cardio score di ogni sessione
  // Running risultava sempre 0, anche con dati HR reali registrati.
  const cardio = cardioScoreFromZones(getZonesContainer(session));
  const ppr = punchesPerRoundAvg(session);
  const punch = punchesScoreFromPerRound(ppr, baselinePpr);

  const perf = 0.3 * cardio + 0.7 * punch;

  return {
    cardio: Math.round(cardio),
    ppr: Math.round(ppr),
    punch: Math.round(punch),
    performance: Math.round(perf),
  };
}

/**
 * MiniLineChart
 * - yMin/yMax: range fisso (utile per VO2, es. 25–75)
 * - refLines: linee orizzontali di riferimento (es. 35/45/55/65)
 */
function MiniLineChart({ title, values, formatValue = fmtInt, yMin, yMax, refLines, headerValue }) {
  const W = 330;
  const H = 110;
  const PAD = 14;

  const clean = Array.isArray(values) ? values.map((v) => safeNumber(v, 0)) : [];
  const n = clean.length;

  const fixedMin = Number.isFinite(Number(yMin)) ? Number(yMin) : null;
  const fixedMax = Number.isFinite(Number(yMax)) ? Number(yMax) : null;

  const dataMax = Math.max(1, ...clean);
  const dataMin = Math.min(0, ...clean);

  const minV = fixedMin != null ? fixedMin : dataMin;
  const maxV = fixedMax != null ? fixedMax : dataMax;

  const points =
    n <= 1
      ? ""
      : clean
          .map((v, i) => {
            const x = PAD + (i * (W - PAD * 2)) / (n - 1);
            const vv = clamp(v, minV, maxV);
            const tt = (vv - minV) / (maxV - minV || 1);
            const y = H - PAD - tt * (H - PAD * 2);
            return `${x},${y}`;
          })
          .join(" ");

  const last = n ? clean[n - 1] : 0;
  // headerValue (se passato, es. media ultime 10) sostituisce l'ultimo
  // singolo punto: un solo valore isolato — es. 0 colpi in una corsa —
  // sembrava un dato rotto anche quando il resto dello storico era sano.
  const displayValue = headerValue != null ? headerValue : last;

  return (
    <View style={styles.miniChartCard}>
      <View style={styles.miniChartHeader}>
        <Text style={styles.miniChartTitle}>{title}</Text>
        <Text style={styles.miniChartValue}>{formatValue(displayValue)}</Text>
      </View>

      <Svg width={W} height={H}>
        <Line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#222" strokeWidth="2" />
        <Line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="#222" strokeWidth="2" />

        {Array.isArray(refLines) && refLines.length > 0
          ? refLines.map((rv, idx) => {
              const v = Number(rv);
              if (!Number.isFinite(v)) return null;
              const vv = clamp(v, minV, maxV);
              const tt = (vv - minV) / (maxV - minV || 1);
              const y = H - PAD - tt * (H - PAD * 2);
              return (
                <React.Fragment key={`ref-${idx}`}>
                  <Line x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="#1a1a1a" strokeWidth="1" />
                  <SvgText x={PAD + 4} y={y - 3} fill="#666" fontSize="10">
                    {String(rv)}
                  </SvgText>
                </React.Fragment>
              );
            })
          : null}

        {points ? (
          <>
            <Polyline points={points} fill="none" stroke="#37E293" strokeWidth="3" />
            {(() => {
              const i = n - 1;
              const x = PAD + (i * (W - PAD * 2)) / (n - 1);
              const vv = clamp(clean[i], minV, maxV);
              const tt = (vv - minV) / (maxV - minV || 1);
              const y = H - PAD - tt * (H - PAD * 2);
              return <Circle cx={x} cy={y} r="4" fill="#37E293" />;
            })()}
          </>
        ) : null}
      </Svg>

      <Text style={styles.miniChartHint}>{t("historyScreen.lastSessions", { n: fmtInt(n) })}</Text>
    </View>
  );
}

function TrendBadge({ delta }) {
  const d = Number(delta);
  if (!Number.isFinite(d)) return null;

  const abs = Math.abs(d);
  const txt = `${d >= 0 ? "↑" : "↓"} ${fmtVo2(abs)}`;
  const bg = d >= 0 ? "#0b1a12" : "#2a0f0f";
  const border = d >= 0 ? "#1f5a3a" : "#7a2a2a";
  const color = d >= 0 ? "#37E293" : "#ff8f8f";

  return (
    <View style={[styles.trendBadge, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[styles.trendBadgeText, { color }]}>{txt}</Text>
    </View>
  );
}

/* ===========================
   ✅ RUNNING HELPERS (NUOVO)
   =========================== */

function isRunningSession(item) {
  if (!item || typeof item !== "object") return false;
  if (String(item?.type || "").toLowerCase() === "running") return true;
  // fallback: se salva distanceM ma non type
  return Number.isFinite(Number(item?.distanceM)) && Number(item?.distanceM) > 0;
}

function fmtKmFromMeters(m) {
  const v = Number(m);
  if (!Number.isFinite(v) || v <= 0) return "0.00";
  return (v / 1000).toFixed(2);
}

function fmtKmh(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "0.0";
  return n.toFixed(1);
}

// Converte sec/km in stringa "min:ss"
function secPerKmToStr(secPerKm) {
  if (!secPerKm || !Number.isFinite(secPerKm) || secPerKm <= 0 || secPerKm > 3600) return "--:--";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return m + ":" + String(s).padStart(2, "0");
}

// Pace media da item (usa avgPaceSecPerKm se disponibile, fallback da velocita)
function runningAvgPaceStr(item) {
  const direct = Number(item?.avgPaceSecPerKm);
  if (Number.isFinite(direct) && direct > 0) return secPerKmToStr(direct);
  const s = Number(item?.speedAvg);
  if (Number.isFinite(s) && s > 0.1) return secPerKmToStr(1000 / s);
  const distM = Number(item?.distanceM);
  const sec = sessionElapsedSeconds(item);
  if (distM > 10 && sec > 5) return secPerKmToStr(sec / (distM / 1000));
  return "--:--";
}

// Best km pace da item
function runningBestKmPaceStr(item) {
  const best = Number(item?.bestKmPaceSecPerKm);
  if (Number.isFinite(best) && best > 0) return secPerKmToStr(best);
  return "--:--";
}

function sessionElapsedSeconds(item) {
  // supporta diverse varianti senza rompere nulla
  const fromHrZones = safeNumber(item?.hrZones?.elapsed, 0);
  if (fromHrZones > 0) return fromHrZones;

  const fromElapsed = safeNumber(item?.elapsed, 0);
  if (fromElapsed > 0) return fromElapsed;

  const fromMinutes = safeNumber(item?.totalMinutes, 0);
  if (fromMinutes > 0) return fromMinutes * 60;

  return 0;
}

function runningAvgSpeedKmh(item) {
  const s = Number(item?.speedAvg);
  // item.speedAvg è salvato in m/s (distanceM / elapsed, vedi RunningScreen.js) —
  // va convertito in km/h, come già fatto correttamente per speedMin/speedMax
  // qualche riga più sotto nel punto di chiamata. Prima mancava la conversione:
  // la "velocità media" mostrata era ~3.6x più bassa del reale.
  if (Number.isFinite(s) && s > 0) return s * 3.6;

  // fallback: calcola da distanza/tempo
  const distM = safeNumber(item?.distanceM, 0);
  const sec = sessionElapsedSeconds(item);
  if (distM > 0 && sec > 5) {
    const mps = distM / sec;
    return mps * 3.6;
  }
  return 0;
}

function getZonesContainer(item) {
  // Mantiene compatibilità: alcune schermate usano hrZones, altre potrebbero usare zones
  if (item?.hrZones && typeof item.hrZones === "object") return item.hrZones;
  if (item?.zones && typeof item.zones === "object") return item.zones;
  return null;
}

export default function HistoryScreen({ navigation }) {
  const { isPro } = usePro();
  const ctx = useHistoryData?.() || {};
  const { requestRpePrompt } = useRpePrompt();
  const sessions = Array.isArray(ctx.sessions) ? ctx.sessions : [];
  const vo2Measurements = Array.isArray(ctx.vo2Measurements) ? ctx.vo2Measurements : [];

  const deleteSessions = ctx.deleteSessions;
  const clearHistory = ctx.clearHistory;

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  useFocusEffect(
    useCallback(() => {
      return () => {
        setSelectMode(false);
        setSelectedIds(new Set());
      };
    }, [])
  );

  const exitSelection = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelect = useCallback((id) => {
    if (!id) return;
    const sid = id.toString();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });
  }, []);

  const onItemPress = useCallback(
    (item) => {
      const id = item?.id?.toString?.();
      if (!id) return;

      if (selectMode) toggleSelect(id);
      else {
        setSelectMode(true);
        setSelectedIds(new Set([id]));
      }
    },
    [selectMode, toggleSelect]
  );

  const onItemLongPress = useCallback((item) => {
    const id = item?.id?.toString?.();
    if (!id) return;
    setSelectMode(true);
    setSelectedIds(new Set([id]));
  }, []);

  const selectedCount = selectedIds.size;

  const deleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return;

    Alert.alert(
      t("historyScreen.deleteConfirmTitle"),
      t("historyScreen.deleteConfirmBody", { n: selectedIds.size }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            const ids = Array.from(selectedIds);
            if (typeof deleteSessions === "function") await Promise.resolve(deleteSessions(ids));
            exitSelection();
          },
        },
      ]
    );
  }, [selectedIds, deleteSessions, exitSelection]);

  const deleteAll = useCallback(() => {
    if (!sessions.length) return;

    Alert.alert(t("historyScreen.clearConfirmTitle"), t("historyScreen.clearConfirmBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.clear"),
        style: "destructive",
        onPress: async () => {
          if (typeof clearHistory === "function") {
            await Promise.resolve(clearHistory());
          }
          exitSelection();
        },
      },
    ]);
  }, [sessions.length, clearHistory, exitSelection]);

  const totals = useMemo(() => {
    const totalSessioni = sessions.length;
    const totaleCalorie = sessions.reduce((s, x) => s + (x?.calories || 0), 0);
    const totaleColpi = sessions.reduce((s, x) => s + (x?.punches || 0), 0);
    const totalMinutes = sessions.reduce((s, x) => s + (x?.totalMinutes || Math.round(sessionElapsedSeconds(x) / 60)), 0);
    return { totalSessioni, totaleCalorie, totaleColpi, totalMinutes };
  }, [sessions]);

  const progressData = useMemo(() => {
    const chrono = [...sessions].reverse();

    // "Colpi per round" ha senso solo per sessioni con conteggio pugni —
    // Running e "Allenamento" (TrainingScreen, sessione cardio libera senza
    // rilevamento colpi) hanno strutturalmente 0 colpi, includerle abbassa
    // artificialmente sia la baseline mediana sia il grafico. Cardio e
    // Performance restano invece su TUTTE le sessioni: il dato cardio è
    // reale in entrambe, va contato.
    const chronoPunches = chrono.filter((s) => !isRunningSession(s) && s?.type !== "training");

    const last10 = chronoPunches.slice(Math.max(0, chronoPunches.length - 10));
    const baselinePpr = median(last10.map((s) => punchesPerRoundAvg(s))) || 1;

    const items = chrono.map((s) => computePerformance(s, baselinePpr));
    const pprItems = chronoPunches.map((s) => computePerformance(s, baselinePpr));

    const lastPerformanceAvg = (() => {
      const tail = items.slice(Math.max(0, items.length - 10));
      if (!tail.length) return 0;
      return Math.round(sum(tail.map((x) => x.performance)) / tail.length);
    })();

    // Media ultime 10 per l'intestazione dei mini-grafici (vedi MiniLineChart
    // headerValue) — riflette lo storico mostrato dalla curva, non un
    // singolo punto isolato.
    const cardioAvg10 = Math.round(avg(items.slice(Math.max(0, items.length - 10)).map((x) => x.cardio)));
    const pprAvg10 = Math.round(avg(pprItems.slice(Math.max(0, pprItems.length - 10)).map((x) => x.ppr)));

    return {
      baselinePpr,
      cardioTrend: items.map((x) => x.cardio),
      pprTrend: pprItems.map((x) => x.ppr),
      performanceTrend: items.map((x) => x.performance),
      lastPerformanceAvg,
      cardioAvg10,
      pprAvg10,
    };
  }, [sessions]);

  const vo2Stats = useMemo(() => {
    if (!vo2Measurements.length) return null;

    const chronological = [...vo2Measurements].reverse();
    const values = chronological.map((m) => safeNumber(m?.value, 0)).filter((v) => v > 0);

    const last = values.length ? values[values.length - 1] : 0;

    const last5 = values.slice(Math.max(0, values.length - 5));
    const avg5 = last5.length ? avg(last5) : 0;

    const prev5 = values.slice(Math.max(0, values.length - 10), Math.max(0, values.length - 5));
    const avgPrev5 = prev5.length ? avg(prev5) : null;

    const delta = avgPrev5 != null ? avg5 - avgPrev5 : null;
    const score = vo2Score01(avg5, 25, 75);

    return { values, last, avg5, avgPrev5, delta, score, count: values.length };
  }, [vo2Measurements]);

  // Share card per singola sessione (stile fight poster UFC + sfondo custom)
  function ShareButton({ session }) {
    const { shareRef, handleShare, sharing } = useShareSession(session);
    const { backgroundUri, pickBackground, removeBackground } = useShareBackground();
    const [previewVisible, setPreviewVisible] = useState(false);

    return (
      <>
        {/* Card nascosta fuori schermo catturata da view-shot */}
        <View style={{ position: "absolute", left: -9999, top: 0, opacity: 0 }}>
          <SessionShareCard ref={shareRef} session={session} backgroundUri={backgroundUri} />
        </View>

        <View style={shareStyles.row}>
          <Pressable style={shareStyles.previewBtn} onPress={() => setPreviewVisible(true)}>
            <Text style={shareStyles.previewBtnText}>{t("historyScreen.preview") || "Anteprima 👁️"}</Text>
          </Pressable>

          <Pressable
            style={shareStyles.btn}
            onPress={handleShare}
            disabled={sharing}
          >
            <Text style={shareStyles.btnText}>{sharing ? (t("historyScreen.sharing") || "Generando...") : (t("historyScreen.share") || "Condividi 📤")}</Text>
          </Pressable>

          <Pressable
            style={shareStyles.bgBtn}
            onPress={pickBackground}
            onLongPress={backgroundUri ? removeBackground : undefined}
          >
            <Text style={shareStyles.bgBtnText}>
              {backgroundUri ? (t("historyScreen.changeBackground") || "Cambia sfondo 🖼️") : (t("historyScreen.addBackground") || "Aggiungi sfondo 🖼️")}
            </Text>
          </Pressable>
        </View>
        {backgroundUri ? (
          <Text style={shareStyles.bgHint}>{t("historyScreen.bgHint") || 'Tieni premuto "Cambia sfondo" per rimuoverlo'}</Text>
        ) : null}

        <ShareCardPreviewModal
          visible={previewVisible}
          onClose={() => setPreviewVisible(false)}
          session={session}
          backgroundUri={backgroundUri}
          onPickBackground={pickBackground}
          onRemoveBackground={removeBackground}
          onShare={handleShare}
          sharing={sharing}
        />
      </>
    );
  }

  const renderItem = ({ item }) => {
    const id = item?.id?.toString?.();
    const selected = !!id && selectedIds.has(id);

    const isRun = isRunningSession(item);

    const perf = computePerformance(item, progressData.baselinePpr);

    const zonesContainer = getZonesContainer(item);
    const elapsedForZones = safeNumber(zonesContainer?.elapsed, 0);

    const runDistKm = fmtKmFromMeters(item?.distanceM);
    const runAvgKmh = fmtKmh(runningAvgSpeedKmh(item));
    const runMinKmh = fmtKmh(safeNumber(item?.speedMin, 0) * 3.6);
    const runMaxKmh = fmtKmh(safeNumber(item?.speedMax, 0) * 3.6);
    const runAvgPace = runningAvgPaceStr(item);
    const runBestKmPace = runningBestKmPaceStr(item);
    const runKmSplits = isRun ? getKmSplitsForSession(item) : [];
    const runTimeSeries = isRun ? getTimeSeriesForSession(item) : [];
    const runHrSeries = runTimeSeries
      .filter((d) => Number.isFinite(d.hr))
      .map((d) => ({ t: d.t, value: d.hr }));
    const runPaceSeries = runTimeSeries
      .filter((d) => Number.isFinite(d.speedKmh))
      .map((d) => ({ t: d.t, value: d.speedKmh }));

    const hrMin = safeNumber(item?.hrMin, NaN);
    const hrMax = safeNumber(item?.hrMax, NaN);

    return (
      <Pressable
        onPress={() => onItemPress(item)}
        onLongPress={() => onItemLongPress(item)}
        style={[styles.card, selectMode && styles.cardSelectable, selected && styles.cardSelected]}
      >
        {elapsedForZones > 0 && (
          <ProGate
            title={t("historyScreen.cardioZonesTitle") || "Zone cardio"}
            teaser={
              <View style={styles.chartsWrap}>
                <View style={styles.chartCompact}>
                  <CardioZonesChart
                    title={t("historyScreen.metabolicTitle")}
                    zones={wrapZonesLabels(zonesMeta(zonesContainer.metabolic))}
                    totalSeconds={elapsedForZones}
                  />
                </View>

                <View style={styles.chartCompact}>
                  <CardioZonesChart
                    title={t("historyScreen.trainingTitle")}
                    zones={wrapZonesLabels(trainingZonesMeta(zonesContainer.training))}
                    totalSeconds={elapsedForZones}
                  />
                </View>
              </View>
            }
          >
            <View style={styles.chartsWrap}>
              <View style={styles.chartCompact}>
                <CardioZonesChart
                  title={t("historyScreen.metabolicTitle")}
                  zones={wrapZonesLabels(zonesMeta(zonesContainer.metabolic))}
                  totalSeconds={elapsedForZones}
                />
              </View>

              <View style={styles.chartCompact}>
                <CardioZonesChart
                  title={t("historyScreen.trainingTitle")}
                  zones={wrapZonesLabels(trainingZonesMeta(zonesContainer.training))}
                  totalSeconds={elapsedForZones}
                />
              </View>
            </View>
          </ProGate>
        )}

        <View style={styles.rowTop}>
          <Text style={styles.workoutName}>
            {item?.workoutName ||
              (isRun ? "Running" : t("timerScreen.workoutDefault"))}
          </Text>

          {isRun ? (
            <View style={styles.runPill}>
              <Text style={styles.runPillText}>RUNNING</Text>
            </View>
          ) : null}

          {selectMode && (
            <View style={[styles.check, selected && styles.checkOn]}>
              <Text style={styles.checkText}>{selected ? "✓" : ""}</Text>
            </View>
          )}
        </View>

        <Text style={styles.date}>{fmtDate(item?.date)}</Text>

        {/* sRPE (BRIEF-srpe.md, Fase 3) — riga RPE se già raccolto (con
            etichetta verbale, mai il numero nudo), azione "Aggiungi RPE" se
            non ancora raccolto ma ancora nella finestra di 24h dalla fine
            sessione. Oltre la finestra: nessuna riga — non un'invenzione a
            posteriori di un valore che l'atleta non può più ricordare con
            affidabilità (stesso principio del brief per rpe/durata), mai una
            cella vuota. loadSrpe mostrato solo se non null: se la durata
            della sessione manca, meglio ometterlo che esporre un campo senza
            spiegazione. Tap → riapre RpePromptModal (riusata, non una
            seconda UI) per aggiungere o correggere. */}
        {item?.rpe != null ? (
          <Pressable style={styles.rpeRow} onPress={() => requestRpePrompt(item.id)}>
            <Text style={styles.rpeValue}>
              {t("historyScreen.rpeValue", { rpe: item.rpe, label: rpeLabel(item.rpe) }) ||
                `RPE ${item.rpe} · ${rpeLabel(item.rpe)}`}
            </Text>
            {item?.loadSrpe != null ? (
              <Text style={styles.rpeLoad}>{(t("rpe.loadLabel") || "Carico sRPE") + " " + item.loadSrpe}</Text>
            ) : null}
            <Text style={styles.rpeEditHint}>✎</Text>
          </Pressable>
        ) : isWithinRpeWindow(item) ? (
          <Pressable style={styles.rpeAddBtn} onPress={() => requestRpePrompt(item.id)}>
            <Text style={styles.rpeAddText}>{t("rpe.addCta") || "+ Aggiungi RPE"}</Text>
          </Pressable>
        ) : null}

        {/* ✅ METRICHE: running vs boxing */}
        {isRun ? (
          <>
            <View style={styles.runPrimaryRow}>
              <Text style={styles.runDistance}>{`📍 ${runDistKm} km`}</Text>
            </View>

            {/* 🗺️ Replay percorso (solo sessioni running) */}
            {!selectMode && (
              <Pressable
                style={styles.replayBtn}
                onPress={() => {
                  if (!isPro) {
                    navigation?.navigate?.("Paywall");
                    return;
                  }
                  try {
                    navigation?.navigate?.("RunningReplay", { sessionId: item?.id });
                  } catch (e) {
                    console.log("⚠️ navigate RunningReplay error:", e?.message);
                  }
                }}
              >
                <Text style={styles.replayBtnText}>
                  {isPro ? "🗺️ Replay percorso" : "🔒 Replay percorso — Pro"}
                </Text>
              </Pressable>
            )}

            {/* Badge pace stile Polar */}
            <View style={styles.polarBadgeCard}>
              <View style={styles.polarRow}>
                <View style={[styles.polarCell, styles.polarCellAccent]}>
                  <Text style={styles.polarLabel}>Pace media</Text>
                  <Text style={[styles.polarValue, styles.polarValueAccent]}>{runAvgPace}</Text>
                  <Text style={styles.polarUnit}>min/km</Text>
                </View>
                <View style={styles.polarCell}>
                  <Text style={styles.polarLabel}>Best km</Text>
                  <Text style={styles.polarValue}>{runBestKmPace}</Text>
                  <Text style={styles.polarUnit}>min/km</Text>
                </View>
                <View style={styles.polarCell}>
                  <Text style={styles.polarLabel}>Vel. media</Text>
                  <Text style={styles.polarValue}>{runAvgKmh === "0.0" ? "--" : runAvgKmh}</Text>
                  <Text style={styles.polarUnit}>km/h</Text>
                </View>
              </View>
              <View style={styles.polarDivider} />
              <View style={styles.polarRow}>
                <View style={[styles.polarCell, Number.isFinite(hrMin) && styles.polarCellHr]}>
                  <Text style={styles.polarLabel}>HR min</Text>
                  <Text style={styles.polarValue}>{Number.isFinite(hrMin) ? fmtInt(hrMin) : "--"}</Text>
                  <Text style={styles.polarUnit}>bpm</Text>
                </View>
                <View style={[styles.polarCell, Number.isFinite(hrMax) && styles.polarCellHr]}>
                  <Text style={styles.polarLabel}>HR max</Text>
                  <Text style={styles.polarValue}>{Number.isFinite(hrMax) ? fmtInt(hrMax) : "--"}</Text>
                  <Text style={styles.polarUnit}>bpm</Text>
                </View>
                <View style={styles.polarCell}>
                  <Text style={styles.polarLabel}>Distanza</Text>
                  <Text style={styles.polarValue}>{runDistKm}</Text>
                  <Text style={styles.polarUnit}>km</Text>
                </View>
              </View>
            </View>

            {/* Split per km + grafici HR/andatura (Pro, come Zone Cardio) */}
            {(runKmSplits.length > 0 || runHrSeries.length > 1 || runPaceSeries.length > 1) && (
              <ProGate
                title={t("historyScreen.kmSplitsTitle") || "Split per km"}
                teaser={
                  <View style={styles.polarBadgeCard}>
                    <RunningKmSplits splits={runKmSplits} />
                    <RunningTimeSeriesChart
                      title={t("historyScreen.hrChartTitle") || "Frequenza cardiaca"}
                      unit="bpm"
                      color="#FF6363"
                      series={runHrSeries}
                    />
                    <RunningTimeSeriesChart
                      title={t("historyScreen.paceChartTitle") || "Andatura"}
                      unit="km/h"
                      color="#2D9CDB"
                      series={runPaceSeries}
                    />
                  </View>
                }
              >
                <View style={styles.polarBadgeCard}>
                  <RunningKmSplits splits={runKmSplits} />
                  <RunningTimeSeriesChart
                    title={t("historyScreen.hrChartTitle") || "Frequenza cardiaca"}
                    unit="bpm"
                    color="#FF6363"
                    series={runHrSeries}
                  />
                  <RunningTimeSeriesChart
                    title={t("historyScreen.paceChartTitle") || "Andatura"}
                    unit="km/h"
                    color="#2D9CDB"
                    series={runPaceSeries}
                  />
                </View>
              </ProGate>
            )}
          </>
        ) : (
          <>
            <View style={styles.metricsRow}>
              <Text style={styles.metric}>{t("historyScreen.minutes", { v: fmtInt(item?.totalMinutes || Math.round(sessionElapsedSeconds(item) / 60)) })}</Text>
              <Text style={styles.metric}>{t("historyScreen.punches", { v: fmtInt(item?.punches) })}</Text>
              <Text style={styles.metric}>{t("historyScreen.kcal", { v: fmtInt(item?.calories) })}</Text>
            </View>

            <View style={styles.scoreRow}>
              <Text style={styles.scorePill}>{t("historyScreen.cardioScore", { v: fmtInt(perf.cardio) })}</Text>
              <Text style={styles.scorePill}>{t("historyScreen.pprScore", { v: fmtInt(perf.punch) })}</Text>
              <Text style={styles.scorePillStrong}>{t("historyScreen.perfScore", { v: fmtInt(perf.performance) })}</Text>
            </View>

            {Number.isFinite(item?.avgHr) && (
              <Text style={styles.avgHr}>{t("historyScreen.avgHr", { v: fmtInt(item?.avgHr) })}</Text>
            )}

            {Array.isArray(item?.punchesByRound) && item.punchesByRound.length > 0 && (
              <Text style={styles.roundsLine}>
                {t("historyScreen.roundsLine", {
                  line: item.punchesByRound.map((n) => Math.round(n)).join(" • "),
                })}
              </Text>
            )}

            {/* Bottone condividi (Pro) */}
            {isPro ? (
              <ShareButton session={item} />
            ) : (
              <Pressable
                style={shareStyles.btn}
                onPress={() => navigation?.navigate?.("Paywall")}
              >
                <Text style={shareStyles.btnText}>🔒 {t("historyScreen.shareLockedCta") || "Condividi la fight card — Pro"}</Text>
              </Pressable>
            )}
          </>
        )}
      </Pressable>
    );
  };

  const ListHeader = (
    <View>
      <AdBanner style={{ marginTop: 12 }} />
      <View style={styles.header}>
        <Text style={styles.title}>{t("history")}</Text>

        {selectMode ? (
          <View style={styles.headerActions}>
            <Pressable style={[styles.btn, styles.btnDanger]} onPress={deleteSelected} disabled={selectedCount === 0}>
              <Text style={styles.btnText}>{t("historyScreen.deleteSelected", { n: selectedCount })}</Text>
            </Pressable>

            <Pressable style={[styles.btn, styles.btnGhost]} onPress={exitSelection}>
              <Text style={styles.btnText}>{t("common.cancel")}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.headerActions}>
            <Pressable
              style={[styles.btn, styles.btnGhost]}
              onPress={() => {
                if (!sessions.length) return;
                setSelectMode(true);
                setSelectedIds(new Set());
              }}
            >
              <Text style={styles.btnText}>{t("common.select")}</Text>
            </Pressable>

            <Pressable style={[styles.btn, styles.btnDanger]} onPress={deleteAll}>
              <Text style={styles.btnText}>{t("common.clear")}</Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={styles.summary}>
        <Text style={styles.summaryText}>Sessioni: {totals.totalSessioni}</Text>
        <Text style={styles.summaryText}>Minuti: {fmtInt(totals.totalMinutes)}</Text>
        <Text style={styles.summaryText}>Colpi: {fmtInt(totals.totaleColpi)}</Text>
        <Text style={styles.summaryText}>Kcal: {fmtInt(totals.totaleCalorie)}</Text>
      </View>

      {sessions.length >= 2 && (
        <View style={styles.progressWrap}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressTitle}>{t("historyScreen.progress")}</Text>
            <Text style={styles.progressSub}>
              {t("historyScreen.perfAvg10", { v: "" })}{" "}
              <Text style={styles.progressStrong}>{fmtInt(progressData.lastPerformanceAvg)}</Text>
            </Text>
            <Text style={styles.progressSub}>
              {t("historyScreen.baseline10", { v: fmtInt(progressData.baselinePpr) })}
            </Text>
          </View>

          <MiniLineChart title={t("historyScreen.cardioTrend")} values={progressData.cardioTrend} headerValue={progressData.cardioAvg10} />
          <MiniLineChart title={t("historyScreen.pprTrend")} values={progressData.pprTrend} headerValue={progressData.pprAvg10} />
          <MiniLineChart title={t("historyScreen.perfTrend")} values={progressData.performanceTrend} headerValue={progressData.lastPerformanceAvg} />
        </View>
      )}

      {vo2Stats?.count >= 1 && (() => {
        const vo2Content = (
          <View style={styles.progressWrap}>
            <View style={styles.progressHeader}>
              <View style={styles.vo2HeaderRow}>
                <Text style={styles.progressTitle}>VO₂ max</Text>
                <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                  {Number.isFinite(vo2Stats.score) ? <ScoreBadge value={vo2Stats.score} /> : null}
                  {vo2Stats.delta != null ? <TrendBadge delta={vo2Stats.delta} /> : null}
                </View>
              </View>

              <Text style={styles.progressSub}>{t("historyScreen.vo2Last", { v: fmtVo2(vo2Stats.last) }) || `Ultimo: ${fmtVo2(vo2Stats.last)} ml/kg/min`}</Text>
              <Text style={styles.progressSub}>{t("historyScreen.vo2Avg5", { v: fmtVo2(vo2Stats.avg5) }) || `Media ultime 5: ${fmtVo2(vo2Stats.avg5)} ml/kg/min`}</Text>
            </View>

            <MiniLineChart
              title={t("historyScreen.vo2TrendTitle") || "Trend VO₂ max (range 25–75)"}
              values={vo2Stats.values}
              formatValue={fmtVo2}
              yMin={25}
              yMax={75}
              refLines={[35, 45, 55, 65]}
            />

            <Text style={styles.vo2Hint}>{t("historyScreen.vo2Measurements", { v: vo2Stats.count }) || `Misurazioni: ${vo2Stats.count}`}</Text>
          </View>
        );
        return (
          <ProGate title={t("vo2Test.title") || "VO2 Max"} teaser={vo2Content}>
            {vo2Content}
          </ProGate>
        );
      })()}
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        style={{ flex: 1 }}
        data={sessions}
        keyExtractor={(item, idx) => item?.id?.toString?.() || String(idx)}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        stickyHeaderIndices={[]}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>{t("historyScreen.empty")}</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },

  header: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#151515",
  },
  title: { color: "#fff", fontSize: 22, fontWeight: "800" },

  headerActions: { flexDirection: "row", gap: 10, marginTop: 10 },

  btn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#333",
    backgroundColor: "#111",
  },
  btnGhost: { backgroundColor: "#111" },
  btnDanger: { backgroundColor: "#2a0f0f", borderColor: "#7a2a2a" },
  btnText: { color: "#fff", fontWeight: "700" },

  summary: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  summaryText: { color: "#aaa", fontWeight: "600" },

  progressWrap: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10 },
  progressHeader: { marginTop: 8, marginBottom: 6 },
  progressTitle: { color: "#fff", fontSize: 16, fontWeight: "800" },
  progressSub: { color: "#888", marginTop: 2, fontWeight: "600" },
  progressStrong: { color: "#ddd", fontWeight: "900" },

  vo2HeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  trendBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  trendBadgeText: { fontWeight: "900" },
  vo2Hint: { color: "#777", fontSize: 12, marginTop: 8, paddingHorizontal: 2 },

  miniChartCard: {
    backgroundColor: "#0b0b10",
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#1e1e25",
  },
  miniChartHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  miniChartTitle: { color: "#ddd", fontWeight: "800" },
  miniChartValue: { color: "#37E293", fontWeight: "900" },
  miniChartHint: { color: "#777", fontSize: 12, marginTop: 6 },

  list: { paddingBottom: 24 },

  card: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: "#0b0b10",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1e1e25",
    padding: 12,
  },
  cardSelectable: { opacity: 0.98 },
  cardSelected: { borderColor: "#37E293" },

  chartsWrap: { flexDirection: "row", gap: 10, marginTop: 8 },
  chartCompact: { flex: 1, transform: [{ scale: 0.82 }], marginTop: -6 },

  rowTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  workoutName: { color: "#fff", fontWeight: "800", flex: 1 },

  runPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#0b1a12",
    borderWidth: 1,
    borderColor: "#1f5a3a",
  },
  runPillText: { color: "#37E293", fontWeight: "900", letterSpacing: 0.5, fontSize: 12 },

  date: { color: "#777", marginTop: 4 },

  metricsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 },

  runPrimaryRow: { marginTop: 10 },
  runDistance: { color: "#fff", fontWeight: "900", fontSize: 18 },
  // Badge Polar stile
  polarBadgeCard: { backgroundColor: "#0D0D14", borderRadius: 14, borderWidth: 1, borderColor: "rgba(55,226,147,0.15)", paddingVertical: 12, paddingHorizontal: 10, gap: 4, marginTop: 8 },
  polarRow: { flexDirection: "row", justifyContent: "space-between", gap: 6 },
  polarDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.07)", marginVertical: 8 },
  polarCell: { flex: 1, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 10, paddingVertical: 8, paddingHorizontal: 6, alignItems: "center", gap: 2 },
  polarCellAccent: { backgroundColor: "rgba(55,226,147,0.10)", borderWidth: 1, borderColor: "rgba(55,226,147,0.22)" },
  polarCellHr: { backgroundColor: "rgba(255,99,99,0.08)", borderWidth: 1, borderColor: "rgba(255,99,99,0.18)" },
  polarLabel: { color: "rgba(255,255,255,0.5)", fontSize: 9, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, textAlign: "center" },
  polarValue: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: -0.5, textAlign: "center" },
  polarValueAccent: { color: "#37E293", fontSize: 17 },
  polarUnit: { color: "rgba(255,255,255,0.4)", fontSize: 9, fontWeight: "700", textAlign: "center" },

  replayBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  replayBtnText: { color: "#fff", fontWeight: "900" },

  metric: { color: "#bbb", fontWeight: "700" },

  scoreRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  scorePill: {
    color: "#ddd",
    backgroundColor: "#111",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#222",
    fontWeight: "800",
  },
  scorePillStrong: {
    color: "#000",
    backgroundColor: "#37E293",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    fontWeight: "900",
  },

  avgHr: { color: "#aaa", marginTop: 8, fontWeight: "700" },
  roundsLine: { color: "#8aecc9", marginTop: 6, fontWeight: "700" },

  rpeRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 8 },
  rpeValue: {
    color: "#FF9500",
    backgroundColor: "rgba(255,149,0,0.1)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    fontWeight: "800",
    fontSize: 13,
  },
  rpeLoad: { color: "#888", fontWeight: "700", fontSize: 12 },
  rpeEditHint: { color: "#666", fontSize: 13 },
  rpeAddBtn: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  rpeAddText: { color: "rgba(255,255,255,0.6)", fontWeight: "700", fontSize: 12.5 },

  check: {
    width: 26,
    height: 26,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#333",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111",
  },
  checkOn: { borderColor: "#37E293", backgroundColor: "#0b1a12" },
  checkText: { color: "#37E293", fontWeight: "900" },

  empty: { color: "#777", textAlign: "center", marginTop: 30, fontWeight: "700" },
});

const shareStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  btn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "rgba(55,226,147,0.1)",
    borderWidth: 1,
    borderColor: "rgba(55,226,147,0.25)",
    alignItems: "center",
  },
  btnText: {
    color: "#37E293",
    fontWeight: "800",
    fontSize: 14,
  },
  previewBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
  },
  previewBtnText: {
    color: "rgba(255,255,255,0.85)",
    fontWeight: "800",
    fontSize: 14,
  },
  bgBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "rgba(212,175,55,0.1)",
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.3)",
    alignItems: "center",
  },
  bgBtnText: {
    color: "#D4AF37",
    fontWeight: "800",
    fontSize: 14,
  },
  bgHint: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 10,
    marginTop: 4,
    textAlign: "center",
  },
});