// src/components/FightScoreBadge.js
//
// Badge Fight Score in tempo reale — stile fight poster.
// Mostra il punteggio 0-100 con le 3 barre componenti e l'etichetta.
// Usato in TimerScreen durante il round.

import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import { scoreColor } from "../services/fightScore";

// ─────────────────────────────────────────────────────────
// Barra singola componente
// ─────────────────────────────────────────────────────────
function ComponentBar({ label, value, max, color }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: Math.min(1, value / max),
      duration: 350,
      useNativeDriver: false,
    }).start();
  }, [value]);

  return (
    <View style={barStyles.row}>
      <Text style={barStyles.label}>{label}</Text>
      <View style={barStyles.track}>
        <Animated.View
          style={[
            barStyles.fill,
            {
              width: anim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
              backgroundColor: color,
            },
          ]}
        />
      </View>
      <Text style={barStyles.value}>{value}</Text>
    </View>
  );
}

const barStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 5,
  },
  label: {
    width: 72,
    color: "rgba(255,255,255,0.55)",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  track: {
    flex: 1,
    height: 5,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 99,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 99,
  },
  value: {
    width: 24,
    color: "rgba(255,255,255,0.5)",
    fontSize: 10,
    fontWeight: "700",
    textAlign: "right",
  },
});

// ─────────────────────────────────────────────────────────
// Numero centrale animato
// ─────────────────────────────────────────────────────────
function AnimatedScore({ score, color }) {
  const anim = useRef(new Animated.Value(score)).current;
  const displayRef = useRef(score);
  const [display, setDisplay] = React.useState(score);

  useEffect(() => {
    Animated.timing(anim, {
      toValue: score,
      duration: 400,
      useNativeDriver: false,
    }).start();

    const id = anim.addListener(({ value }) => {
      const rounded = Math.round(value);
      if (rounded !== displayRef.current) {
        displayRef.current = rounded;
        setDisplay(rounded);
      }
    });
    return () => anim.removeListener(id);
  }, [score]);

  return (
    <Text style={[numStyles.score, { color }]}>
      {display}
    </Text>
  );
}

const numStyles = StyleSheet.create({
  score: {
    fontSize: 52,
    fontWeight: "900",
    letterSpacing: -2,
    lineHeight: 58,
  },
});

// ─────────────────────────────────────────────────────────
// BADGE PRINCIPALE
// ─────────────────────────────────────────────────────────

/**
 * @param {object} props
 *   scoreData  - oggetto da useFightScore / calcFightScore
 *   phase      - fase timer ("round", "rest", ecc.)
 */
export default function FightScoreBadge({ scoreData, phase }) {
  const isActive = String(phase || "").toLowerCase() === "round";
  const { total, hrScore, paceScore, constancyScore, label, ppm } = scoreData || {};
  const color = scoreColor(total ?? 0);

  return (
    <View style={[styles.card, !isActive && styles.cardDim]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerLabel}>FIGHT SCORE</Text>
        {isActive && (
          <View style={[styles.liveDot]}>
            <Text style={styles.liveDotText}>LIVE</Text>
          </View>
        )}
      </View>

      {/* Score + label */}
      <View style={styles.scoreRow}>
        <View style={styles.scoreLeft}>
          <AnimatedScore score={total ?? 0} color={isActive ? color : "#333"} />
          <Text style={styles.outOf}>/100</Text>
        </View>

        <View style={styles.scoreRight}>
          <Text style={[styles.label, { color: isActive ? color : "#444" }]}>
            {isActive ? (label ?? "IDLE") : "REST"}
          </Text>
          {ppm > 0 && isActive && (
            <Text style={styles.ppm}>{ppm} colpi/min</Text>
          )}
        </View>
      </View>

      {/* Barre componenti */}
      <View style={styles.bars}>
        <ComponentBar
          label="HR zone"
          value={hrScore ?? 0}
          max={40}
          color={isActive ? "#FF4D6D" : "#2a2a2a"}
        />
        <ComponentBar
          label="Cadenza"
          value={paceScore ?? 0}
          max={40}
          color={isActive ? "#FF9500" : "#2a2a2a"}
        />
        <ComponentBar
          label="Costanza"
          value={constancyScore ?? 0}
          max={20}
          color={isActive ? "#37E293" : "#2a2a2a"}
        />
      </View>

      {/* Footer */}
      {!isActive && (
        <Text style={styles.restHint}>
          {String(phase || "").toLowerCase() === "rest"
            ? "In pausa — riprenderà al prossimo round"
            : "Avvia il round per vedere il Fight Score"}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    backgroundColor: "#0D0D14",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,77,109,0.18)",
    paddingVertical: 16,
    paddingHorizontal: 18,
    gap: 12,
    marginTop: 12,
  },
  cardDim: {
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "#0A0A10",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLabel: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  liveDot: {
    backgroundColor: "rgba(255,77,109,0.15)",
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "rgba(255,77,109,0.35)",
  },
  liveDotText: {
    color: "#FF4D6D",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  scoreLeft: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
  },
  outOf: {
    color: "rgba(255,255,255,0.25)",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  scoreRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  label: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  ppm: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    fontWeight: "600",
  },
  bars: {
    gap: 2,
  },
  restHint: {
    color: "rgba(255,255,255,0.25)",
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
    marginTop: 4,
  },
});