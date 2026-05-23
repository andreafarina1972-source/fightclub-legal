// src/components/ui/GlassCard.js
import React from "react";
import { View, StyleSheet } from "react-native";

export default function GlassCard({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(12, 12, 18, 0.95)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#2D2C33",
    padding: 16,
    marginBottom: 12,
  },
});
