// src/screens/RunningScreen.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import * as Location from "expo-location";
import { WebView } from "react-native-webview";

// ✅ react-native-svg opzionale
let _SvgPkg = null;
function getSvgSafe() {
  if (_SvgPkg) return _SvgPkg;
  try { _SvgPkg = require("react-native-svg"); return _SvgPkg; }
  catch (e) { console.log("⚠️ react-native-svg non disponibile:", e?.message); return null; }
}

// ✅ Leaflet (OpenStreetMap) via WebView
const LEAFLET_HTML = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height:100%; width:100%; margin:0; padding:0; background:#111; }
    .leaflet-control-attribution { display:none; }
  </style>
</head>
<body>
  <div id="map"></div><div id="err" style="position:absolute;left:12px;right:12px;top:12px;background:rgba(0,0,0,0.75);color:#fff;padding:10px;border-radius:12px;font-family:Arial;display:none;z-index:9999;">Tiles non caricati. Controlla connessione Internet.</div>
  <script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    let map, marker, segPolys = [], didInit = false;
    function init(lat, lon) {
      if (didInit) return; didInit = true;
      map = L.map('map', { zoomControl: true, preferCanvas: true }).setView([lat, lon], 16);
      const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 });
      tiles.addTo(map);
      tiles.on('tileerror', function(){ try{ document.getElementById('err').style.display='block'; }catch(e){} });
      marker = L.circleMarker([lat, lon], { radius: 6 }).addTo(map);
    }
    function clearSegments() { segPolys.forEach(p => { try { map.removeLayer(p); } catch(e){} }); segPolys = []; }
    function renderSegments(segments) {
      if (!segments || !segments.length) return;
      clearSegments();
      segments.forEach(s => {
        const ll = (s.coords || []).map(c => [c.lat, c.lon]).filter(a => Number.isFinite(a[0]) && Number.isFinite(a[1]));
        if (ll.length < 2) return;
        segPolys.push(L.polyline(ll, { weight: 5, color: s.color || '#ff5252' }).addTo(map));
      });
    }
    function fitToSegments() {
      try { const all = []; segPolys.forEach(p => { all.push(...p.getLatLngs()); }); if (all.length < 2) return; map.fitBounds(L.latLngBounds(all), { padding: [24,24] }); } catch(e){}
    }
    function setMarker(lat, lon, follow) {
      if (!didInit) init(lat, lon);
      if (marker) marker.setLatLng([lat, lon]);
      if (follow && map) map.setView([lat, lon], map.getZoom(), { animate: true });
    }
    function handle(msg) {
      if (!msg) return;
      if (msg.type === 'render') {
        const center = msg.center, markerPos = msg.marker;
        if (center && Number.isFinite(center.lat) && Number.isFinite(center.lon)) init(center.lat, center.lon);
        if (msg.segments) renderSegments(msg.segments);
        if (msg.fit) fitToSegments();
        if (markerPos && Number.isFinite(markerPos.lat) && Number.isFinite(markerPos.lon)) setMarker(markerPos.lat, markerPos.lon, !!msg.follow);
        if (center && map) map.setView([center.lat, center.lon], map.getZoom(), { animate: true });
      }
    }
    document.addEventListener('message', (e) => { try { handle(JSON.parse(e.data)); } catch(err){} });
    window.addEventListener('message', (e) => { try { handle(JSON.parse(e.data)); } catch(err){} });
  </script>
</body>
</html>`;

import { t } from "../i18n";
import { useHistoryData } from "../context/HistoryContext";
import { estimateCaloriesFromSession } from "../services/vo2Utils";
import { connectHeartRate, subscribeHeartRate, getConnectedDeviceInfo, getDefaultHeartRateDevice, getAntDefaultDevice } from "../services/heartRateService";
import CardioZonesChart from "../components/CardioZonesChart";
import { getHrMax, zonesMeta, trainingZonesMeta, initZonesAccumulator, accumulateZones } from "../services/hrZones";
import { computeKmSplits, computeTimeSeries } from "../services/runningSplits";

let Maps = null;
function getMapsSafe() {
  if (Maps) return Maps;
  try { Maps = require("react-native-maps"); return Maps; }
  catch (e) { console.log("⚠️ react-native-maps non disponibile:", e?.message); return null; }
}

class MapErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error) { console.log("🗺️ MapView error:", error?.message); }
  render() {
    if (this.state.hasError) return (
      <View style={styles.mapFallback}>
        <Text style={styles.mapFallbackTitle}>Mappa non disponibile</Text>
        <Text style={styles.mapFallbackText}>
          La mappa ha generato un errore. Puoi continuare senza mappa.
        </Text>
        {this.props.onDisable && <Pressable style={styles.mapFallbackBtn} onPress={this.props.onDisable}><Text style={styles.mapFallbackBtnText}>{t("runningScreen.hideMap")}</Text></Pressable>}
      </View>
    );
    return this.props.children;
  }
}

function toLatLng(points) {
  if (!Array.isArray(points)) return [];
  return points.map((p) => {
    const latitude = Number(p?.lat), longitude = Number(p?.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude, longitude };
  }).filter(Boolean);
}
function computeRegionFromCoords(coords) {
  if (!coords.length) return null;
  let minLat = coords[0].latitude, maxLat = coords[0].latitude;
  let minLon = coords[0].longitude, maxLon = coords[0].longitude;
  for (const c of coords) {
    minLat = Math.min(minLat, c.latitude); maxLat = Math.max(maxLat, c.latitude);
    minLon = Math.min(minLon, c.longitude); maxLon = Math.max(maxLon, c.longitude);
  }
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max(0.002, (maxLat - minLat) * 1.6),
    longitudeDelta: Math.max(0.002, (maxLon - minLon) * 1.6),
  };
}

function colorForHrZone(z) {
  if (z === 1) return "rgba(120,180,255,0.95)";
  if (z === 2) return "rgba(55,226,147,0.95)";
  if (z === 3) return "rgba(255,214,102,0.95)";
  if (z === 4) return "rgba(255,140,66,0.95)";
  if (z === 5) return "rgba(255,99,132,0.95)";
  return "rgba(255,255,255,0.25)";
}

function buildHrSegments(routePoints, hrMax) {
  if (!Array.isArray(routePoints) || routePoints.length < 2) return [];
  const pts = routePoints.map((p) => {
    const lat = Number(p?.lat ?? p?.latitude), lon = Number(p?.lon ?? p?.longitude);
    const hr = p?.hr == null ? null : Number(p.hr);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon, z: trainingZoneIndex(hr, hrMax) };
  }).filter(Boolean);
  if (pts.length < 2) return [];
  const out = [];
  let cur = [{ lat: pts[0].lat, lon: pts[0].lon }], curZone = pts[0].z, curColor = colorForHrZone(curZone);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p.z === curZone) { cur.push({ lat: p.lat, lon: p.lon }); }
    else {
      if (cur.length >= 2) out.push({ coords: cur, color: curColor, zone: curZone });
      curZone = p.z; curColor = colorForHrZone(curZone);
      const prev = pts[i - 1];
      cur = [{ lat: prev.lat, lon: prev.lon }, { lat: p.lat, lon: p.lon }];
    }
  }
  if (cur.length >= 2) out.push({ coords: cur, color: curColor, zone: curZone });
  return out;
}

let Speech = null;
function getSpeechSafe() {
  if (Speech) return Speech;
  try { Speech = require("expo-speech"); return Speech; }
  catch (e) { console.log("⚠️ expo-speech non disponibile:", e?.message); return null; }
}
function speakOnce(text) {
  const S = getSpeechSafe();
  if (!S?.speak || !text) return;
  try { if (S.stop) S.stop(); S.speak(String(text), { language: "it-IT", rate: 0.95, pitch: 1.0 }); }
  catch (e) { console.log("⚠️ speak error:", e?.message); }
}

// Oltre questa precisione orizzontale (metri) il fix GPS viene scartato:
// da fermi (specie in interni) il GPS può "derivare" di alcuni metri tra un
// fix e l'altro anche senza movimento reale; senza filtro quella deriva viene
// letta come spostamento e sommata alla distanza.
const GPS_MAX_ACCURACY_M = 20;

function haversineMeters(a, b) {
  if (!a || !b) return 0;
  const toRad = (x) => (x * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2), sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function trainingZoneIndex(hr, hrMax) {
  const h = Number(hr), mx = Number(hrMax);
  if (!Number.isFinite(h) || !Number.isFinite(mx) || mx <= 0) return null;
  const p = (h / mx) * 100;
  if (p < 60) return 1; if (p < 70) return 2; if (p < 80) return 3; if (p < 90) return 4; return 5;
}
function zoneLabel(z) { return z ? `Zona ${z}` : ""; }

// ─────────────────────────────────────────────────────────
// UTILS PACE (min:ss per km)
// ─────────────────────────────────────────────────────────
function secPerKmToStr(secPerKm) {
  if (!secPerKm || !Number.isFinite(secPerKm) || secPerKm <= 0 || secPerKm > 3600) return "--:--";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Pace istantanea da m/s
function speedToPaceStr(ms) {
  if (!ms || ms <= 0.1) return "--:--";
  return secPerKmToStr(1000 / ms);
}

// Pace media: elapsed (s) / distanza (km)
function avgPaceStr(elapsed, distanceM) {
  if (!distanceM || distanceM < 10 || elapsed <= 0) return "--:--";
  return secPerKmToStr(elapsed / (distanceM / 1000));
}

// Calcola il km più veloce (best split km) dai punti GPS
// Scorre i routePoints cercando la finestra temporale più veloce per 1000m
function computeBestKmPace(routePoints) {
  if (!Array.isArray(routePoints) || routePoints.length < 2) return null;
  // costruisce array di {distProg, t} (distanza progressiva in metri, timestamp)
  const pts = [];
  let cumDist = 0;
  for (let i = 0; i < routePoints.length; i++) {
    if (i > 0) {
      const d = haversineMeters(routePoints[i - 1], routePoints[i]);
      if (d >= 0 && d <= 50) cumDist += d;
    }
    pts.push({ dist: cumDist, t: routePoints[i].t });
  }
  if (pts[pts.length - 1].dist < 1000) return null; // meno di 1 km totale

  let bestSecPerKm = null;
  let j = 0;
  for (let i = 1; i < pts.length; i++) {
    // avanza j finché la finestra [j,i] è >= 1000m
    while (j < i - 1 && pts[i].dist - pts[j + 1].dist >= 1000) j++;
    const windowDist = pts[i].dist - pts[j].dist;
    if (windowDist >= 950) { // tolleranza 5%
      const windowTime = (pts[i].t - pts[j].t) / 1000; // secondi
      if (windowTime > 0) {
        const secPerKm = windowTime / (windowDist / 1000);
        if (bestSecPerKm == null || secPerKm < bestSecPerKm) bestSecPerKm = secPerKm;
      }
    }
  }
  return bestSecPerKm;
}

// ─────────────────────────────────────────────────────────
// COMPONENTE BADGE POLAR STILE
// ─────────────────────────────────────────────────────────
function PolarBadge({ label, value, unit, accent = false, sub = null }) {
  return (
    <View style={[polarStyles.cell, accent && polarStyles.cellAccent]}>
      <Text style={polarStyles.cellLabel}>{label}</Text>
      <Text style={[polarStyles.cellValue, accent && polarStyles.cellValueAccent]}>
        {value}
      </Text>
      {unit ? <Text style={polarStyles.cellUnit}>{unit}</Text> : null}
      {sub ? <Text style={polarStyles.cellSub}>{sub}</Text> : null}
    </View>
  );
}

function PolarMetricsBadge({ elapsed, distanceM, speedNow, speedAvg, hr, hrMin, hrMax, bestKmPace }) {
  const paceNowStr    = speedToPaceStr(speedNow);
  const paceAvgStr    = avgPaceStr(elapsed, distanceM);
  const bestPaceStr   = bestKmPace != null ? secPerKmToStr(bestKmPace) : "--:--";
  const hrStr         = hr != null ? String(hr) : "--";
  const hrMinStr      = hrMin != null ? String(hrMin) : "--";
  const hrMaxStr      = hrMax != null ? String(hrMax) : "--";

  return (
    <View style={polarStyles.card}>
      {/* Riga 1 — Pace */}
      <View style={polarStyles.row}>
        <PolarBadge
          label={t("runningScreen.pace") || "Andatura"}
          value={paceNowStr}
          unit="min/km"
          accent
        />
        <PolarBadge
          label={t("runningScreen.avgPace") || "Pace media"}
          value={paceAvgStr}
          unit="min/km"
        />
        <PolarBadge
          label={t("runningScreen.bestKm") || "Best km"}
          value={bestPaceStr}
          unit="min/km"
          sub={t("runningScreen.best") || "migliore"}
        />
      </View>

      {/* Separatore */}
      <View style={polarStyles.divider} />

      {/* Riga 2 — Frequenza cardiaca */}
      <View style={polarStyles.row}>
        <PolarBadge
          label={t("runningScreen.hr") || "Freq. cardiaca"}
          value={hrStr}
          unit="bpm"
          accent={hr != null}
        />
        <PolarBadge
          label={t("runningScreen.hrMin") || "HR min"}
          value={hrMinStr}
          unit="bpm"
        />
        <PolarBadge
          label={t("runningScreen.hrMax") || "HR max"}
          value={hrMaxStr}
          unit="bpm"
        />
      </View>
    </View>
  );
}

// Gauge velocità semplificato
function SpeedGauge({ valueKmh = NaN }) {
  const v = Number.isFinite(Number(valueKmh)) ? Number(valueKmh) : 0;
  return (
    <View style={styles.speedBadgeWrap}>
      <Text style={styles.speedBadgeLabel}>{t("runningScreen.speed") || "Velocità"}</Text>
      <Text style={styles.speedBadgeValue}>{v.toFixed(1)} km/h</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// SCHERMATA PRINCIPALE
// ─────────────────────────────────────────────────────────
export default function RunningScreen() {
  const { addSession } = useHistoryData();
  const MAP_ALLOWED = true;

  const [running, setRunning] = useState(false);

  // HR
  const [hrStatus, setHrStatus] = useState("disconnected");
  const [hr, setHr] = useState(null);
  const [connectedDeviceInfo, setConnectedDeviceInfo] = useState(null);
  const [hrMismatch, setHrMismatch] = useState(false);
  const hrRef = useRef(null); // specchio sempre aggiornato di `hr`, per le closure a deps vuote (es. startLocationWatch)
  const hrMinRef = useRef(null);
  const hrMaxSessionRef = useRef(null);

  // Time
  const [elapsed, setElapsed] = useState(0);
  const tickRef = useRef(null);

  // GPS / route
  const [gpsStatus, setGpsStatus] = useState("off");
  const [showMap, setShowMap] = useState(true);
  const [distanceM, setDistanceM] = useState(0);
  const [speedNow, setSpeedNow] = useState(null);
  const [speedMin, setSpeedMin] = useState(null);
  const [speedMax, setSpeedMax] = useState(null);
  const routeRef = useRef([]);
  const lastPointRef = useRef(null);
  const locationSubRef = useRef(null);
  const previewSubRef = useRef(null);
  const mapRef = useRef(null);
  const webRef = useRef(null);
  const webReadyRef = useRef(false);
  const didCenterRef = useRef(false);

  // Best km pace (aggiornato ogni volta che la distanza cambia di ~100m)
  const [bestKmPace, setBestKmPace] = useState(null);
  const lastBestKmUpdateRef = useRef(0);

  const postToWeb = useCallback((payload) => {
    try { if (!webRef.current || !webReadyRef.current) return; webRef.current.postMessage(JSON.stringify(payload)); }
    catch {}
  }, []);

  // Zones
  const zonesRef = useRef(initZonesAccumulator());
  const hrMaxRef = useRef(0);
  const [zonesLive, setZonesLive] = useState(zonesRef.current);
  const [hrMax, setHrMax] = useState(0);

  // Voice coach
  const lastMinuteSpokenRef = useRef(-1);
  const last500mBucketRef = useRef(-1);
  const lastKmBucketRef = useRef(-1);
  const lastZoneRef = useRef(null);
  const zoneStableSinceRef = useRef(0);
  const lastZoneSpokenAtRef = useRef(0);

  const resetSession = useCallback(() => {
    setElapsed(0);
    setGpsStatus("off");
    setDistanceM(0);
    setSpeedNow(null);
    setSpeedMin(null);
    setSpeedMax(null);
    setBestKmPace(null);
    routeRef.current = [];
    lastPointRef.current = null;
    hrRef.current = null;
    hrMinRef.current = null;
    hrMaxSessionRef.current = null;
    zonesRef.current = initZonesAccumulator();
    setZonesLive(zonesRef.current);
    lastMinuteSpokenRef.current = -1;
    last500mBucketRef.current = -1;
    lastKmBucketRef.current = -1;
    lastZoneRef.current = null;
    zoneStableSinceRef.current = 0;
    lastZoneSpokenAtRef.current = 0;
    lastBestKmUpdateRef.current = 0;
  }, []);

  // HR subscription
  useEffect(() => {
    const unsub = subscribeHeartRate((bpm) => {
      const v = Number(bpm);
      if (!Number.isFinite(v) || v <= 0) return;
      const bpmRound = Math.round(v);
      hrRef.current = bpmRound;
      setHr(bpmRound);
      setHrStatus("connected");
      if (hrMinRef.current == null || bpmRound < hrMinRef.current) hrMinRef.current = bpmRound;
      if (hrMaxSessionRef.current == null || bpmRound > hrMaxSessionRef.current) hrMaxSessionRef.current = bpmRound;
    });
    return () => { if (typeof unsub === "function") unsub(); };
  }, []);

  // ❤️ Device effettivamente connesso vs default salvato — permette di
  // accorgersi di un aggancio a una fascia diversa dalla propria.
  useEffect(() => {
    if (hrStatus !== "connected") {
      setConnectedDeviceInfo(null);
      setHrMismatch(false);
      return;
    }
    (async () => {
      const info = getConnectedDeviceInfo();
      setConnectedDeviceInfo(info);
      if (!info) { setHrMismatch(false); return; }
      try {
        if (info.source === "ble") {
          const def = await getDefaultHeartRateDevice();
          setHrMismatch(!!def?.id && def.id !== info.id);
        } else if (info.source === "ant") {
          const def = await getAntDefaultDevice();
          setHrMismatch(def?.antDeviceNumber != null && String(def.antDeviceNumber) !== info.id);
        } else {
          setHrMismatch(false);
        }
      } catch {
        setHrMismatch(false);
      }
    })();
  }, [hrStatus]);

  // tick 1s
  useEffect(() => {
    if (!running) return;
    tickRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); tickRef.current = null; };
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
        zonesRef.current.elapsed = (zonesRef.current.elapsed || 0) + dt;
        setZonesLive({ ...zonesRef.current });
        return;
      }
      accumulateZones(zonesRef.current, hr, hrMaxRef.current);
      setZonesLive({ ...zonesRef.current });
    }, 1000);
    return () => clearInterval(id);
  }, [running, hr]);

  // Best km pace: ricalcola ogni ~100m per non pesare troppo
  useEffect(() => {
    if (!running || distanceM < 1000) return;
    if (distanceM - lastBestKmUpdateRef.current < 100) return;
    lastBestKmUpdateRef.current = distanceM;
    const best = computeBestKmPace(routeRef.current);
    if (best != null) setBestKmPace(best);
  }, [distanceM, running]);

  const metZones = useMemo(() => zonesMeta(zonesLive.metabolic), [zonesLive]);
  const trainZones = useMemo(() => trainingZonesMeta(zonesLive.training), [zonesLive]);

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60), s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };
  const toKmh = (ms) => ms * 3.6;
  const speedNowKmh = useMemo(() => (speedNow == null ? NaN : toKmh(speedNow)), [speedNow]);
  const routeCoords = useMemo(() => toLatLng(routeRef.current), [distanceM]);
  const routeRegion = useMemo(() => computeRegionFromCoords(routeCoords), [routeCoords]);

  const stopLocationWatch = useCallback(async () => {
    try { if (locationSubRef.current) { locationSubRef.current.remove(); locationSubRef.current = null; } }
    catch {}
  }, []);

  const stopPreviewWatch = useCallback(async () => {
    try { if (previewSubRef.current) { previewSubRef.current.remove(); previewSubRef.current = null; } }
    catch {}
  }, []);

  const startPreviewWatch = useCallback(async () => {
    if (!showMap || running) return;
    setGpsStatus((s) => (s === "ok" ? s : "searching"));
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") { setGpsStatus("denied"); return; }
    const enabled = await Location.hasServicesEnabledAsync();
    if (!enabled) { setGpsStatus("denied"); return; }
    try {
      const first = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      const c = first?.coords;
      if (c?.latitude != null && c?.longitude != null) {
        const p0 = { lat: c.latitude, lon: c.longitude, latitude: c.latitude, longitude: c.longitude, t: Date.now(), speed: Number.isFinite(c.speed) ? c.speed : null };
        lastPointRef.current = p0;
        setGpsStatus("ok");
        didCenterRef.current = false;
        postToWeb({ type: "render", center: { lat: p0.lat, lon: p0.lon }, marker: { lat: p0.lat, lon: p0.lon }, segments: [], fit: true, follow: false });
        didCenterRef.current = true;
      }
    } catch {}
    try {
      const sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 3, mayShowUserSettingsDialog: true }, (pos) => {
        const c = pos?.coords;
        if (!c) return;
        if (Number.isFinite(c.accuracy) && c.accuracy > GPS_MAX_ACCURACY_M) return;
        const p = { lat: c.latitude, lon: c.longitude, latitude: c.latitude, longitude: c.longitude, t: Date.now(), speed: Number.isFinite(c.speed) ? c.speed : null };
        lastPointRef.current = p;
        setGpsStatus("ok");
        postToWeb({ type: "render", center: { lat: p.lat, lon: p.lon }, marker: { lat: p.lat, lon: p.lon }, segments: [], fit: !didCenterRef.current, follow: true });
        if (!didCenterRef.current) didCenterRef.current = true;
      });
      previewSubRef.current = sub;
    } catch (e) { console.log("❌ GPS preview error:", e?.message); }
  }, [postToWeb, running, showMap]);

  const startLocationWatch = useCallback(async () => {
    setGpsStatus("searching");
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") { setGpsStatus("denied"); throw new Error("Location permission denied"); }
    const enabled = await Location.hasServicesEnabledAsync();
    if (!enabled) { setGpsStatus("denied"); throw new Error("Location services disabled"); }
    const sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Highest, timeInterval: 1000, distanceInterval: 1, mayShowUserSettingsDialog: true },
      (pos) => {
        const c = pos?.coords;
        if (!c) return;
        if (Number.isFinite(c.accuracy) && c.accuracy > GPS_MAX_ACCURACY_M) return;
        const lat = c.latitude, lon = c.longitude;
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        const rawSp = Number.isFinite(c.speed) ? Math.max(0, c.speed) : null;
        const tMs = pos.timestamp ? Number(pos.timestamp) : Date.now();
        // hrRef.current (non lo stato `hr`): questa closure è memoizzata con
        // deps vuote, quindi `hr` resterebbe congelato al valore del primo
        // render (sempre null) — bug di stale closure che azzerava l'HR per
        // ogni punto del percorso, mai emerso finché nessuno usava point.hr.
        const point = { lat, lon, t: tMs, speed: rawSp, hr: hrRef.current ?? null };
        const last = lastPointRef.current;
        // La velocità "grezza" del GPS (c.speed, stima Doppler del chip) è spesso
        // inaffidabile: su molti dispositivi resta a 0 o è molto rumorosa anche
        // durante il movimento. Calcoliamo quindi la velocità dallo spostamento
        // reale tra due fix consecutivi (stessa distanza già usata per l'incremento
        // di distanceM, diviso il tempo trascorso) — coerente con l'approccio già
        // usato in computeBestKmPace, molto più rappresentativo del movimento
        // effettivo. Il valore GPS grezzo resta come fallback solo per il
        // primissimo fix, quando non c'è ancora un punto precedente.
        let measuredSp = rawSp;
        if (last) {
          const d = haversineMeters(last, point);
          if (d >= 0 && d <= 30) setDistanceM((prev) => prev + d);
          const dtSec = (tMs - last.t) / 1000;
          if (d >= 0 && d <= 30 && dtSec > 0.3 && dtSec < 15) measuredSp = d / dtSec;
        }
        lastPointRef.current = point;
        routeRef.current.push(point);
        if (showMap) {
          const segments = buildHrSegments(routeRef.current, hrMaxRef.current);
          postToWeb({ type: "render", center: { lat: point.lat, lon: point.lon }, marker: { lat: point.lat, lon: point.lon }, segments, fit: !didCenterRef.current && segments.length > 0, follow: !!running });
          if (!didCenterRef.current) didCenterRef.current = true;
        }
        if (routeRef.current.length > 20000) routeRef.current.splice(0, routeRef.current.length - 20000);
        setSpeedNow(measuredSp);
        if (measuredSp != null) {
          setSpeedMin((v) => (v == null ? measuredSp : Math.min(v, measuredSp)));
          setSpeedMax((v) => (v == null ? measuredSp : Math.max(v, measuredSp)));
        }
        setGpsStatus("ok");
      }
    );
    locationSubRef.current = sub;
    return sub;
  }, []);

  // Voice coach
  useEffect(() => {
    if (!running) return;
    const minute = Math.floor(elapsed / 60);
    if (minute > 0 && elapsed % 60 === 0 && lastMinuteSpokenRef.current !== minute) {
      lastMinuteSpokenRef.current = minute;
      speakOnce(`${minute} minuto${minute === 1 ? "" : "i"}`);
    }
    if (distanceM > 0) {
      const bucket500 = Math.floor(distanceM / 500);
      if (bucket500 > 0 && last500mBucketRef.current !== bucket500) {
        last500mBucketRef.current = bucket500;
        if (bucket500 % 2 === 1) speakOnce(`Distanza ${(distanceM / 1000).toFixed(1)} chilometri`);
      }
      const bucketKm = Math.floor(distanceM / 1000);
      if (bucketKm > 0 && lastKmBucketRef.current !== bucketKm) {
        lastKmBucketRef.current = bucketKm;
        // Annuncia anche la pace media al km
        const paceAtKm = avgPaceStr(elapsed, distanceM);
        speakOnce(`${bucketKm} chilometro${bucketKm === 1 ? "" : "i"}, pace ${paceAtKm}`);
      }
    }
    const z = trainingZoneIndex(hr, hrMaxRef.current || hrMax);
    const now = Date.now();
    if (z != null) {
      if (lastZoneRef.current !== z) { lastZoneRef.current = z; zoneStableSinceRef.current = now; }
      else {
        const stableFor = now - (zoneStableSinceRef.current || now);
        const sinceSpoken = now - (lastZoneSpokenAtRef.current || 0);
        if (stableFor >= 3000 && sinceSpoken >= 20000) { lastZoneSpokenAtRef.current = now; speakOnce(zoneLabel(z)); }
      }
    }
  }, [running, elapsed, distanceM, hr, hrMax]);

  const handleStart = useCallback(async () => {
    if (running) return;
    resetSession();
    lastAccRef.current = Date.now();
    try { const v = await getHrMax(); hrMaxRef.current = Number(v) || 0; setHrMax(Number(v) || 0); }
    catch { hrMaxRef.current = 0; setHrMax(0); }
    try { await activateKeepAwakeAsync(); } catch {}
    try { setHrStatus("scanning"); await connectHeartRate(); }
    catch { setHrStatus("disconnected"); }
    try { await startLocationWatch(); }
    catch (e) { console.log("❌ GPS start error:", e?.message); Alert.alert(t("runningScreen.gps"), t("runningScreen.locationPermissionBody")); }
    speakOnce(t("runningScreen.voiceStart") || "Inizio corsa");
    setRunning(true);
  }, [running, resetSession, startLocationWatch]);

  const stopAndAskSave = useCallback(async () => {
    if (!running) return;
    setRunning(false);
    try { deactivateKeepAwake(); } catch {}
    await stopLocationWatch();
    if (elapsed < 5) return;

    // Calcola best km finale (con tutti i punti)
    const finalBestKm = computeBestKmPace(routeRef.current);
    const speedAvgFinal = elapsed > 0 ? distanceM / elapsed : 0;
    const avgPaceSecPerKm = distanceM > 10 ? elapsed / (distanceM / 1000) : null;
    // Split per km + serie temporale HR/andatura, per la sezione dedicata nello storico
    const kmSplits = computeKmSplits(routeRef.current);
    const timeSeries = computeTimeSeries(routeRef.current);

    Alert.alert("Running", t("timerScreen.interruptedBody") || "Vuoi salvare la sessione nello storico?", [
      { text: t("common.no") || "No", style: "destructive" },
      {
        text: t("common.yes") || "Sì",
        onPress: () => {
          const calories = estimateCaloriesFromSession(elapsed, hr ?? 0);
          addSession({
            id: Date.now().toString(),
            type: "running",
            workoutId: null,
            workoutName: "Running",
            punches: 0,
            punchesByRound: [],
            avgHr: hr ?? null,
            elapsed: zonesRef.current.elapsed,
            calories,
            createdAt: new Date().toISOString(),
            date: new Date().toISOString(),
            // ── metriche running ──────────────────────────
            distanceM,
            speedNow,
            speedAvg: speedAvgFinal,
            speedMin,
            speedMax,
            hrMin: hrMinRef.current,
            hrMax: hrMaxSessionRef.current,
            // ── NUOVI CAMPI PACE ─────────────────────────
            avgPaceSecPerKm,              // pace media in sec/km (es. 300 = 5:00/km)
            bestKmPaceSecPerKm: finalBestKm, // km migliore in sec/km
            kmSplits,                     // [{ km, splitSec, hrMax }] per ogni km pieno
            timeSeries,                   // [{ t, hr, speedKmh }] a bucket di 30s
            // ─────────────────────────────────────────────
            routePoints: routeRef.current,
            zones: {
              hrMax: hrMaxRef.current || hrMax || null,
              elapsed: zonesRef.current.elapsed,
              metabolic: { ...zonesRef.current.metabolic },
              training: { ...zonesRef.current.training },
            },
          });
        },
      },
    ]);
  }, [running, elapsed, stopLocationWatch, addSession, hr, hrMax, distanceM, speedNow, speedMin, speedMax]);

  const handleClear = useCallback(async () => {
    if (running) return;
    await stopLocationWatch();
    resetSession();
  }, [running, stopLocationWatch, resetSession]);

  const speedAvg = useMemo(() => (elapsed > 0 ? distanceM / elapsed : 0), [distanceM, elapsed]);
  const hrStatusText = hrStatus === "connected" ? t("home.hrConnectedDot") : hrStatus === "scanning" ? t("home.hrScanningDot") : t("home.hrOffDot");
  const gpsLine = gpsStatus === "ok" ? "GPS • ok" : gpsStatus === "searching" ? "GPS • ricerca…" : gpsStatus === "denied" ? "GPS • negato" : "GPS • off";

  useEffect(() => {
    if (!MAP_ALLOWED || !showMap) return;
    const M = getMapsSafe();
    if (!M || !mapRef.current || !routeRegion) return;
    try { mapRef.current.animateToRegion(routeRegion, 350); } catch {}
  }, [routeRegion, showMap, MAP_ALLOWED]);

  useEffect(() => {
    if (!showMap) return;
    if (!running) { startPreviewWatch(); }
    else { stopPreviewWatch(); }
    return () => { stopPreviewWatch(); };
  }, [running, showMap, startPreviewWatch, stopPreviewWatch]);

  const formatKm = (m) => (m / 1000).toFixed(2);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>{t("runningScreen.title")}</Text>
        <Text style={styles.subTitle}>{t("runningScreen.voiceCoachSubtitle") || "Coach vocale: tempo • distanza • zona HR • pace"}</Text>

        <View style={styles.gaugeWrap}>
          <SpeedGauge valueKmh={Number.isFinite(speedNowKmh) ? speedNowKmh : NaN} />
        </View>

        {/* ── BADGE POLAR ─────────────────────────────── */}
        <PolarMetricsBadge
          elapsed={elapsed}
          distanceM={distanceM}
          speedNow={speedNow}
          speedAvg={speedAvg}
          hr={hr}
          hrMin={hrMinRef.current}
          hrMax={hrMaxSessionRef.current}
          bestKmPace={bestKmPace}
        />

        {/* ── MAPPA ───────────────────────────────────── */}
        <View style={styles.mapToggleRow}>
          <Text style={styles.mapTitle}>{t("runningScreen.routeMap") || "Mappa percorso"}</Text>
          <Pressable onPress={() => setShowMap((v) => !v)} style={({ pressed }) => [styles.mapToggleBtn, pressed && { opacity: 0.85 }]}>
            <Text style={styles.mapToggleBtnText}>{showMap ? t("runningScreen.hideMap") : t("runningScreen.showMap")}</Text>
          </Pressable>
        </View>
        {showMap ? (
          <View style={styles.mapCard}>
            <Text style={styles.mapTitle}>{t("runningScreen.mapTitle")}</Text>
            <View style={styles.mapWrap}>
              <WebView
                ref={webRef}
                // Solo http/https (default della libreria): la pagina Leaflet non
                // naviga mai altrove, non serve allargare l'whitelist a "*". Niente
                // allowFileAccessFromFileURLs/allowUniversalAccessFromFileURLs (accesso
                // a file locali non necessario, l'HTML è inline) né mixedContentMode
                // "always" (tutte le risorse — cdn.jsdelivr.net, tile.openstreetmap.org
                // — sono già https). Riduce la superficie di attacco se lo script
                // Leaflet caricato da CDN fosse mai compromesso (nessun SRI sul tag).
                source={{ html: LEAFLET_HTML }}
                javaScriptEnabled
                domStorageEnabled
                onLoadEnd={() => {
                  webReadyRef.current = true;
                  const last = lastPointRef.current;
                  if (last) {
                    const segments = buildHrSegments(routeRef.current, hrMaxRef.current);
                    postToWeb({ type: "render", center: { lat: last.lat ?? last.latitude, lon: last.lon ?? last.longitude }, marker: { lat: last.lat ?? last.latitude, lon: last.lon ?? last.longitude }, segments, fit: true, follow: !!running });
                    didCenterRef.current = true;
                  }
                }}
              />
            </View>
            <Text style={styles.mapHint}>Mappa OpenStreetMap (Leaflet) • Nessuna API key.</Text>
          </View>
        ) : null}

        {/* ── KPI GENERALI ────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.kpi}>
              <Text style={styles.kpiLabel}>{t("runningScreen.time")}</Text>
              <Text style={styles.kpiValue}>{formatTime(elapsed)}</Text>
            </View>
            <View style={styles.kpi}>
              <Text style={styles.kpiLabel}>{t("runningScreen.distance")}</Text>
              <Text style={styles.kpiValue}>{formatKm(distanceM)} km</Text>
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.kpi}>
              <Text style={styles.kpiLabel}>{t("runningScreen.avgSpeed") || "Velocità media"}</Text>
              <Text style={styles.kpiValue}>{speedAvg <= 0 ? "--" : `${(speedAvg * 3.6).toFixed(1)} km/h`}</Text>
            </View>
            <View style={styles.kpi}>
              <Text style={styles.kpiLabel}>HR</Text>
              <Text style={styles.kpiValue}>{hr == null ? "--" : `${hr} bpm`}</Text>
            </View>
          </View>
          <Text style={styles.statusLine}>
            {hrStatusText} • {gpsLine}{" "}
            <Text style={styles.hrMinMax}>HR min/max: {hrMinRef.current ?? "--"} / {hrMaxSessionRef.current ?? "--"}</Text>
          </Text>
          {connectedDeviceInfo && (
            <Text style={[styles.statusLine, hrMismatch && { color: "#F6B100", fontWeight: "700" }]}>
              {t("bluetooth.connectedDevice", { defaultValue: "Dispositivo connesso" })}: {connectedDeviceInfo.name}
              {hrMismatch ? ` (${t("bluetooth.connectedMismatch", { defaultValue: "diverso dal predefinito" })})` : ""}
            </Text>
          )}
        </View>

        {/* ── LEGENDA ZONE ────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.mapTitle}>{t("trainingScreen.legendsTitle") || "Legende"}</Text>
          <View style={styles.legendWrap}>
            <Text style={styles.legendTitle}>{t("zones.trainingTitle") || "Zone allenamento (Z1–Z5)"}</Text>
            <View style={styles.legendRow}>
              {[1, 2, 3, 4, 5].map((z) => (
                <View key={`lz-${z}`} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: colorForHrZone(z) }]} />
                  <Text style={styles.legendText}>Z{z}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={styles.legendWrap}>
            <Text style={styles.legendTitle}>{t("zones.metabolicBadge") || "Zone metaboliche"}</Text>
            <View style={styles.legendRow}>
              {metZones.map((z) => {
                const range = z.key === "cardio" ? "60-75%" : z.key === "aer_latt" ? "75-87%" : z.key === "an_latt" ? "87-95%" : z.key === "an_alatt" ? "95-100%" : null;
                return (
                  <View key={`lm-${z.key}`} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: z.color }]} />
                    <Text style={styles.legendText}>
                      {z?.labelKey && t(z.labelKey) !== z.labelKey ? t(z.labelKey) : z.label}
                      {range ? <Text style={styles.legendSub}> ({range})</Text> : null}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        {(running || elapsed > 0) && (
          <View style={{ width: "100%" }}>
            <CardioZonesChart title={t("timerScreen.metabolicTitle", { hrMax: hrMax || "--" })} zones={metZones} totalSeconds={Math.max(1, elapsed)} />
            <CardioZonesChart title={t("timerScreen.trainingTitle")} zones={trainZones} totalSeconds={Math.max(1, elapsed)} />
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {!running ? (
          <View style={styles.footerRow}>
            <Pressable style={[styles.btn, styles.btnPrimary, { flex: 1 }]} onPress={handleStart}>
              <Text style={styles.btnText}>{t("start") || "START"}</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnSecondary, { flex: 1 }]} onPress={handleClear}>
              <Text style={[styles.btnText, { color: "white" }]}>{t("common.clear") || "Svuota"}</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={[styles.btn, styles.btnDanger]} onPress={stopAndAskSave}>
            <Text style={styles.btnText}>{t("stop") || "STOP"}</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────
// STILI BADGE POLAR
// ─────────────────────────────────────────────────────────
const polarStyles = StyleSheet.create({
  card: {
    width: "100%",
    backgroundColor: "#0D0D14",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(55,226,147,0.15)",
    paddingVertical: 14,
    paddingHorizontal: 12,
    gap: 4,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.07)",
    marginVertical: 10,
  },
  cell: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 2,
  },
  cellAccent: {
    backgroundColor: "rgba(55,226,147,0.10)",
    borderWidth: 1,
    borderColor: "rgba(55,226,147,0.25)",
  },
  cellLabel: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    textAlign: "center",
  },
  cellValue: {
    color: "white",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.5,
    textAlign: "center",
  },
  cellValueAccent: {
    color: "#37E293",
    fontSize: 22,
  },
  cellUnit: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
  },
  cellSub: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 9,
    fontWeight: "600",
    textAlign: "center",
  },
});

// ─────────────────────────────────────────────────────────
// STILI PRINCIPALI
// ─────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#050508" },
  container: { padding: 18, paddingBottom: 120, gap: 14 },
  title: { color: "white", fontSize: 22, fontWeight: "900" },
  subTitle: { color: "rgba(255,255,255,0.75)", marginTop: -8 },
  gaugeWrap: { width: "100%", alignItems: "center", marginTop: 6, marginBottom: 2 },
  card: { width: "100%", backgroundColor: "#14131A", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", gap: 12 },
  row: { flexDirection: "row", gap: 12 },
  kpi: { flex: 1 },
  kpiLabel: { color: "rgba(255,255,255,0.65)", fontWeight: "800", fontSize: 12 },
  kpiValue: { color: "white", fontWeight: "900", fontSize: 20, marginTop: 4 },
  statusLine: { color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 4 },
  hrMinMax: { color: "rgba(255,255,255,0.85)" },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 14, backgroundColor: "rgba(5,5,8,0.92)", borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  footerRow: { flexDirection: "row", gap: 12 },
  mapCard: { width: "100%", backgroundColor: "#14131A", borderRadius: 16, padding: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", gap: 10 },
  mapTitle: { color: "rgba(255,255,255,0.85)", fontWeight: "900" },
  mapWrap: { width: "100%", height: 220, borderRadius: 14, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.04)" },
  mapHint: { color: "rgba(255,255,255,0.55)", fontSize: 12 },
  mapFallback: { width: "100%", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", gap: 6 },
  mapFallbackTitle: { color: "white", fontWeight: "900" },
  mapFallbackText: { color: "rgba(255,255,255,0.75)" },
  mapFallbackBtn: { alignSelf: "flex-start", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  mapFallbackBtnText: { color: "white", fontWeight: "800" },
  btn: { paddingVertical: 14, borderRadius: 14, alignItems: "center" },
  btnPrimary: { backgroundColor: "#37E293" },
  btnSecondary: { backgroundColor: "rgba(255,255,255,0.12)" },
  btnDanger: { backgroundColor: "#E23759" },
  btnText: { color: "#f8f8fbff", fontWeight: "900", letterSpacing: 1 },
  legendWrap: { width: "100%", paddingTop: 8 },
  legendTitle: { color: "white", fontWeight: "900", fontSize: 12 },
  legendRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 999, opacity: 0.95 },
  legendText: { color: "white", fontWeight: "900", fontSize: 12 },
  legendSub: { color: "rgba(255,255,255,0.75)", fontWeight: "800", fontSize: 11 },
  mapToggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16, marginBottom: 8 },
  mapToggleBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  mapToggleBtnText: { color: "white", fontWeight: "800" },
  speedBadgeWrap: { alignItems: "center", justifyContent: "center", paddingVertical: 14, paddingHorizontal: 16, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.25)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", minWidth: 180, alignSelf: "center" },
  speedBadgeLabel: { color: "rgba(255,255,255,0.75)", fontWeight: "800", letterSpacing: 0.3, marginBottom: 4 },
  speedBadgeValue: { color: "white", fontWeight: "900", fontSize: 26 },
});