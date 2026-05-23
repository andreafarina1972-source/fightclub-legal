import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Svg, Rect } from "react-native-svg";

export default function PunchesBarChart({ data = [] }) {
  if (!data.length) return null;

  const width = 300;
  const height = 160;
  const barWidth = 20;
  const gap = 16;

  const maxValue = Math.max(...data, 1);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Colpi per round</Text>

      <Svg width={width} height={height}>
        {data.map((value, index) => {
          const barHeight = (value / maxValue) * (height - 30);
          const x = index * (barWidth + gap);
          const y = height - barHeight;

          return (
            <Rect
              key={index}
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx={4}
              fill="#37E293"
            />
          );
        })}
      </Svg>

      <View style={styles.labels}>
        {data.map((_, i) => (
          <Text key={i} style={styles.label}>
            R{i + 1}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
    alignItems: "center",
  },
  title: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  labels: {
    flexDirection: "row",
    width: 300,
    justifyContent: "flex-start",
    paddingLeft: 2,
  },
  label: {
    width: 36,
    marginRight: 16,
    color: "#777",
    fontSize: 12,
    textAlign: "center",
  },
});
