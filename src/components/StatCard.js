import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function StatCard({ label, value, unit }) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <Text style={styles.value}>{value}</Text>
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#101010',
    padding: 12,
    borderRadius: 12,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: '#222'
  },
  label: {
    color: '#999',
    fontSize: 12,
    marginBottom: 4
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end'
  },
  value: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700'
  },
  unit: {
    color: '#777',
    fontSize: 12,
    marginLeft: 4,
    marginBottom: 2
  }
});
