// src/components/CardioZonesChart.js
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { t, getLanguage, subscribeLanguageChange } from "../i18n";

function fmtTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

// Avoid showing "[missing ... translation]" strings in UI.
// Falls back to the provided fallback label.
function safeT(key, fallback) {
  if (!key) return fallback;
  try {
    const out = t(key);
    if (!out) return fallback;
    if (typeof out === "string" && out.startsWith("[missing")) return fallback;
    return out;
  } catch (e) {
    return fallback;
  }
}


/**
 * Stile "Polar": lista di barre (una per zona) con tempo.
 *
 * Props:
 * - title?: string
 * - subtitle?: string
 * - zones: Array<{ key?: string, label?: string, labelKey?: string, seconds?: number, color?: string }>
 */
export default function CardioZonesChart({ title, subtitle, zones = [] }) {
  const total = useMemo(
    () => zones.reduce((sum, z) => sum + (Number(z?.seconds) || 0), 0),
    [zones]
  );

    const [lang, setLang] = useState(getLanguage());

  useEffect(() => {
    setLang(getLanguage());
    const unsub = subscribeLanguageChange((l) => setLang(l));
    return unsub;
  }, []);

  return (
    <View key={lang} style={styles.card}>
      {!!title && <Text style={styles.title}>{title}</Text>}
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

      <View style={{ gap: 12, marginTop: 8 }}>
        {zones.map((z, idx) => {
          const seconds = Number(z?.seconds) || 0;
          const pct = total > 0 ? Math.max(0, Math.min(1, seconds / total)) : 0;

          const label = safeT(z?.labelKey, z?.label ?? z?.key ?? `Z${idx + 1}`);

          return (
            <View key={z?.key || String(idx)} style={styles.row}>
              <View style={styles.rowTop}>
                <Text style={styles.label}>{label}</Text>
                <Text style={styles.time}>{fmtTime(seconds)}</Text>
              </View>

              <View style={styles.bar}>
                <View
                  style={[
                    styles.barFill,
                    {
                      width: `${Math.round(pct * 100)}%`,
                      backgroundColor: z?.color || "rgba(255,255,255,0.25)",
                    },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 18,
    padding: 14,
  },
  title: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "900", letterSpacing: 0.6 },
  subtitle: { color: "rgba(255,255,255,0.65)", fontSize: 12, marginTop: 2, fontWeight: "700" },

  row: { gap: 6 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { color: "#ddd", fontSize: 13, fontWeight: "700" },
  time: { color: "#aaa", fontSize: 12, fontWeight: "700" },

  bar: {
    marginTop: 6,
    height: 10,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "#1a1a1a",
  },
  barFill: {
    height: "100%",
    borderRadius: 999,
  },
});
