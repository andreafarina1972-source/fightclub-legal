// src/screens/RunningReplayRouteScreen.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, SafeAreaView, Pressable } from "react-native";
import { WebView } from "react-native-webview";
import { t } from "../i18n";
import { useHistoryData } from "../context/HistoryContext";

// Leaflet / OpenStreetMap (no API key)
const LEAFLET_HTML = '<!doctype html>\n<html>\n<head>\n  <meta charset="utf-8"/>\n  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">\n  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />\n  <style>\n    html, body, #map { height: 100%; width: 100%; margin: 0; padding: 0; background: #111; }\n    .leaflet-control-attribution { display:none; }\n  </style>\n</head>\n<body>\n  <div id="map"></div>\n  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>\n  <script>\n    let map, polyAll, polyShown, marker;\n    let didInit = false;\n\n    function init(lat, lon) {\n      if (didInit) return;\n      didInit = true;\n      map = L.map(\'map\', { zoomControl: true, preferCanvas: true }).setView([lat, lon], 16);\n      L.tileLayer(\'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png\', { maxZoom: 19 }).addTo(map);\n      polyAll = L.polyline([], { weight: 4, opacity: 0.35 }).addTo(map);\n      polyShown = L.polyline([], { weight: 5, opacity: 1.0 }).addTo(map);\n      marker = L.circleMarker([lat, lon], { radius: 6 }).addTo(map);\n    }\n\n    function fit(points) {\n      if (!map || !points || points.length < 2) return;\n      const b = L.latLngBounds(points);\n      map.fitBounds(b, { padding: [24,24] });\n    }\n\n    function setAll(points, doFit) {\n      if (!points || points.length === 0) return;\n      const ll = points.map(p => [p.lat, p.lon]);\n      init(points[0].lat, points[0].lon);\n      polyAll.setLatLngs(ll);\n      if (doFit) fit(ll);\n    }\n\n    function setShown(points, follow) {\n      if (!points || points.length === 0) return;\n      const ll = points.map(p => [p.lat, p.lon]);\n      init(points[0].lat, points[0].lon);\n      polyShown.setLatLngs(ll);\n      const last = ll[ll.length - 1];\n      marker.setLatLng(last);\n      if (follow && map) map.setView(last, map.getZoom(), { animate: true });\n    }\n\n    function setCursor(p, follow) {\n      if (!p) return;\n      init(p.lat, p.lon);\n      marker.setLatLng([p.lat, p.lon]);\n      if (follow && map) map.setView([p.lat, p.lon], map.getZoom(), { animate: true });\n    }\n\n    function handle(raw) {\n      try {\n        const msg = JSON.parse(raw);\n        if (msg.type === "init") init(msg.lat, msg.lon);\n        if (msg.type === "all") setAll(msg.points || [], !!msg.fit);\n        if (msg.type === "shown") setShown(msg.points || [], !!msg.follow);\n        if (msg.type === "cursor") setCursor(msg.point, !!msg.follow);\n      } catch (e) {}\n    }\n\n    document.addEventListener("message", (e) => handle(e.data));\n    window.addEventListener("message", (e) => handle(e.data));\n  </script>\n</body>\n</html>';

function toLatLon(routePoints) {
  if (!Array.isArray(routePoints)) return [];
  return routePoints
    .map((p) => {
      // Support both formats: {lat,lon} and {latitude,longitude}
      const lat = Number(p?.lat ?? p?.latitude);
      const lon = Number(p?.lon ?? p?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return { lat, lon };
    })
    .filter(Boolean);
}

export default function RunningReplayRouteScreen({ route }) {
  const { sessions } = useHistoryData();

  const session = useMemo(() => {
    const id = route?.params?.id ?? route?.params?.sessionId ?? route?.params?.session?.id;
    if (!id) return route?.params?.session || null;
    return (sessions || []).find((s) => String(s.id) === String(id)) || route?.params?.session || null;
  }, [route?.params, sessions]);

  // In your app, the saved path can be in session.routePoints or session.route
  const allPoints = useMemo(() => {
    const raw = session?.routePoints || session?.route || [];
    return toLatLon(raw);
  }, [session]);

  const [playing, setPlaying] = useState(false);
  const [idx, setIdx] = useState(0);
  const timerRef = useRef(null);

  const webRef = useRef(null);
  const didFitRef = useRef(false);

  const curPoint = useMemo(() => {
    if (!allPoints.length) return null;
    const safeIdx = Math.max(0, Math.min(idx, allPoints.length - 1));
    return allPoints[safeIdx] || null;
  }, [allPoints, idx]);

  const shownPoints = useMemo(() => {
    if (!allPoints.length) return [];
    const safeIdx = Math.max(0, Math.min(idx, allPoints.length - 1));
    return allPoints.slice(0, safeIdx + 1);
  }, [allPoints, idx]);

  const post = (obj) => {
    try {
      webRef.current?.postMessage(JSON.stringify(obj));
    } catch {}
  };

  useEffect(() => {
    // reset when session changes
    setIdx(0);
    setPlaying(false);
    didFitRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, [session?.id]);

  useEffect(() => {
    if (!playing) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    timerRef.current = setInterval(() => {
      setIdx((v) => {
        const next = v + 1;
        if (next >= allPoints.length) {
          // stop at end
          setPlaying(false);
          return v;
        }
        return next;
      });
    }, 500);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [playing, allPoints.length]);

  // On map load: draw full route and fit bounds once
  const onMapReady = () => {
    if (!allPoints.length) return;
    post({ type: "init", lat: allPoints[0].lat, lon: allPoints[0].lon });
    post({ type: "all", points: allPoints, fit: true });
    didFitRef.current = true;
    // set initial cursor/shown
    post({ type: "shown", points: shownPoints, follow: false });
  };

  // Update shown path + cursor as we move
  useEffect(() => {
    if (!webRef.current) return;
    if (!curPoint) return;
    post({ type: "shown", points: shownPoints, follow: playing });
    post({ type: "cursor", point: curPoint, follow: playing });
  }, [idx, playing, curPoint, shownPoints.length]);

  if (!session) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.title}>Replay percorso</Text>
          <Text style={styles.text}>Sessione non trovata.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>{(typeof t === "function" ? t("replay_route") : null) || "Replay percorso"}</Text>
        <Text style={styles.text}>
          {allPoints.length} punti
        </Text>
      </View>

      <View style={styles.mapWrap}>
        <WebView
          ref={webRef}
          originWhitelist={["*"]}
          source={ { html: LEAFLET_HTML } }
          javaScriptEnabled
          domStorageEnabled
          mixedContentMode="always"
          onLoadEnd={onMapReady}
        />
      </View>

      <View style={styles.controls}>
        <Pressable
          style={[styles.btn, playing ? styles.btnActive : null]}
          onPress={() => setPlaying((v) => !v)}
          disabled={allPoints.length < 2}
        >
          <Text style={styles.btnText}>{playing ? "Pausa" : "Play"}</Text>
        </Pressable>

        <Pressable
          style={styles.btn}
          onPress={() => {
            setPlaying(false);
            setIdx(0);
            // re-fit and reset cursor
            didFitRef.current = false;
            onMapReady();
          }}
          disabled={allPoints.length < 2}
        >
          <Text style={styles.btnText}>Reset</Text>
        </Pressable>

        <View style={styles.progress}>
          <Text style={styles.progressText}>
            {Math.min(idx + 1, allPoints.length)} / {allPoints.length}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#000" },
  header: { padding: 14, gap: 4 },
  title: { color: "white", fontSize: 20, fontWeight: "900" },
  text: { color: "rgba(255,255,255,0.7)" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20, gap: 10 },
  mapWrap: {
    flex: 1,
    marginHorizontal: 14,
    marginBottom: 12,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#111",
  },
  controls: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingBottom: 14 },
  btn: {
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  btnActive: { backgroundColor: "rgba(55,226,147,0.25)" },
  btnText: { color: "white", fontWeight: "900" },
  progress: { flex: 1, alignItems: "flex-end" },
  progressText: { color: "rgba(255,255,255,0.7)", fontWeight: "800" },
});
