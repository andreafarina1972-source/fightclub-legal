import React, { useEffect, useRef } from "react";
import { View, Animated, StyleSheet } from "react-native";

export default function SoundLevelVisualizer({ active }) {
  const bar1 = useRef(new Animated.Value(4)).current;
  const bar2 = useRef(new Animated.Value(10)).current;
  const bar3 = useRef(new Animated.Value(4)).current;

  useEffect(() => {
    if (!active) {
      // Reset quando non attivo
      bar1.setValue(4);
      bar2.setValue(10);
      bar3.setValue(4);
      return;
    }

    const animate = (bar, min, max) => {
      return Animated.loop(
        Animated.sequence([
          Animated.timing(bar, {
            toValue: max,
            duration: 150,
            useNativeDriver: false,
          }),
          Animated.timing(bar, {
            toValue: min,
            duration: 150,
            useNativeDriver: false,
          }),
        ]),
      ).start();
    };

    animate(bar1, 4, 20);
    animate(bar2, 10, 28);
    animate(bar3, 4, 18);
  }, [active]);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.bar, { height: bar1 }]} />
      <Animated.View style={[styles.bar, { height: bar2, marginHorizontal: 5 }]} />
      <Animated.View style={[styles.bar, { height: bar3 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 28,
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: 12,
  },
  bar: {
    width: 6,
    backgroundColor: "#37E293",
    borderRadius: 3,
  },
});

