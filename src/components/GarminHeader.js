import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function GarminHeader({ title, subtitle }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 40,
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: '#1f1f1f'
  },
  title: {
    color: '#37e293',
    fontSize: 24,
    fontWeight: '700'
  },
  subtitle: {
    color: '#aaaaaa',
    marginTop: 4,
    fontSize: 12,
    textTransform: 'uppercase'
  }
});