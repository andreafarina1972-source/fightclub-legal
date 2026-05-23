import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
// FIX #9: Slider rimosso da react-native core → usare @miblanchard/react-native-slider
import { Slider } from '@miblanchard/react-native-slider';
import GarminHeader from '../components/GarminHeader';

import { t } from "../i18n";
import { usePunches } from '../context/PunchContext';
import { startPunchDetection, stopPunchDetection } from '../services/audioPunchCounter';

export default function MicScreen() {
  const { punchCount, resetPunches, incrementPunches } = usePunches();
  const [sensitivity, setSensitivity] = useState(0.5);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    return () => stopPunchDetection();
  }, []);

  const toggle = () => {
    if (running) {
      stopPunchDetection();
      setRunning(false);
    } else {
      resetPunches();
      startPunchDetection(() => incrementPunches(), sensitivity);
      setRunning(true);
    }
  };

  return (
    <View style={styles.container}>
      <GarminHeader title={t("mic.title", { defaultValue: "Microfono / colpi" })} subtitle={t("mic.subtitle", { defaultValue: "Sensibilità & conteggio" })} />
      <View style={styles.content}>
        <Text style={styles.label}>{t("mic.sensitivity", { defaultValue: "Sensibilità (0–1)" })}</Text>
        {/* Se Slider non è disponibile, puoi usare un TextInput numerico */}
        <Slider
          style={{ width: '100%', height: 40 }}
          minimumValue={0.1}
          maximumValue={0.9}
          value={sensitivity}
          onValueChange={(v) => setSensitivity(Array.isArray(v) ? v[0] : v)}
          minimumTrackTintColor="#37e293"
          maximumTrackTintColor="#444"
          thumbTintColor="#37e293"
        />
        <Text style={styles.value}>{sensitivity.toFixed(2)}</Text>

        <Text style={styles.counter}>
          {t("mic.punchesDetected", { defaultValue: "Colpi rilevati:" })} <Text style={styles.counterValue}>{punchCount}</Text>
        </Text>

        <TouchableOpacity style={styles.btn} onPress={toggle}>
          <Text style={styles.btnText}>
            {running ? t('mic.stop', { defaultValue: 'FERMA RILEVAMENTO' }) : t('mic.start', { defaultValue: 'AVVIA RILEVAMENTO' })}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.resetBtn]}
          onPress={resetPunches}
        >
          <Text style={styles.btnText}>{t('mic.reset', { defaultValue: 'AZZERA COLPI' })}</Text>
        </TouchableOpacity>

        <Text style={styles.note}>
          {t('mic.note', { defaultValue: "Nota: al momento il conteggio colpi è simulato. Per usare il microfono reale servirà un modulo nativo che streammi l'audio e rilevi i picchi." })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: { flex: 1, padding: 16 },
  label: { color: '#aaa', fontSize: 14 },
  value: { color: '#37e293', marginTop: 4, marginBottom: 16 },
  counter: { color: '#aaa', fontSize: 16, marginTop: 16 },
  counterValue: { color: '#fff', fontWeight: '700' },
  btn: {
    marginTop: 16,
    backgroundColor: '#37e293',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center'
  },
  resetBtn: {
    backgroundColor: '#444'
  },
  btnText: { color: '#000', fontWeight: '700' },
  note: {
    color: '#777',
    fontSize: 12,
    marginTop: 16
  }
});
