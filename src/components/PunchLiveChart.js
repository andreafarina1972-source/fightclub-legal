// src/components/PunchLiveChart.js
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { VictoryLine, VictoryChart, VictoryTheme } from "victory-native";

export default function PunchLiveChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyText}>Nessun colpo rilevato...</Text>
      </View>
    );
  }

  return (
    <View style={styles.chartBox}>
      <Text style={styles.title}>Colpi (live)</Text>

      <VictoryChart
        theme={VictoryTheme.material}
        height={180}
        padding={{ top: 20, bottom: 40, left: 45, right: 20 }}
        style={{ background: { fill: "#111" } }}
        domainPadding={{ x: [10, 10] }}
      >
        <VictoryLine
          data={data}
          interpolation="monotoneX"
          style={{
            data: {
              stroke: "#37E293",
              strokeWidth: 3,
            },
          }}
        />
      </VictoryChart>
    </View>
  );
}

const styles = StyleSheet.create({
  chartBox: {
    backgroundColor: "#111",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#222",
    marginBottom: 12,
  },
  title: {
    color: "#37E293",
    fontWeight: "700",
    fontSize: 16,
    marginBottom: 6,
  },
  emptyBox: {
    backgroundColor: "#111",
    borderRadius: 10,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#222",
    marginBottom: 12,
  },
  emptyText: { color: "#777" },
});
