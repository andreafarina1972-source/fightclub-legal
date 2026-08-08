// src/screens/BluetoothScreen.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Alert } from "react-native";
import GarminHeader from "../components/GarminHeader";
import { usePro } from "../context/ProContext";


import { t } from "../i18n";
import {
  scanHeartRateDevices,
  setDefaultHeartRateDevice,
  getDefaultHeartRateDevice,
  clearDefaultHeartRateDevice,
  connectHeartRate,
  disconnectHeartRate,
  subscribeHeartRate,
} from "../services/heartRateService";

export default function BluetoothScreen({ navigation }) {
  const { isPro } = usePro();
  const [devices, setDevices] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | scanning | done
  const [defaultDev, setDefaultDev] = useState(null);

  // stato connessione “reale” basato sull’arrivo di bpm
  const [hr, setHr] = useState(null);
  const [hrStatus, setHrStatus] = useState("disconnected"); // disconnected | scanning | connected

  const connectingRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const def = await getDefaultHeartRateDevice();
        setDefaultDev(def || null);
      } catch (e) {
        console.log("getDefaultHeartRateDevice error:", e?.message || e);
      }
    })();
  }, []);

  // ✅ listener bpm: se arrivano dati → consideriamo “connected”
  useEffect(() => {
    let alive = true;

    const unsub = subscribeHeartRate?.((bpm) => {
      if (!alive) return;
      setHr(bpm);
      setHrStatus("connected");
    });

    return () => {
      alive = false;
      unsub?.();
    };
  }, []);

  const badgeText = useMemo(() => {
    if (hrStatus === "connected") return `${t("home.hrConnectedDot", { defaultValue: "• connessa" })} ${hr ? `${hr} bpm` : ""}`.trim();
    if (hrStatus === "scanning") return t("bluetooth.connectingDot", { defaultValue: "• connessione…" });
    return t("home.hrOffDot", { defaultValue: "• off" });
  }, [hrStatus, hr]);

  const startScan = async () => {
    if (status === "scanning") return;

    setStatus("scanning");
    setDevices([]);

    try {
      const list = await scanHeartRateDevices({
        timeoutMs: 12000,
        onUpdate: (partial) => setDevices(Array.isArray(partial) ? partial : []),
      });

      setDevices(Array.isArray(list) ? list : []);
    } catch (e) {
      console.log("Scan error:", e?.message || e);
      Alert.alert(
        t("settingsScreen.error", { defaultValue: "Errore" }),
        t("bluetooth.scanFail", { defaultValue: "Scansione fallita. Verifica Bluetooth e permessi." })
      );
    } finally {
      setStatus("done");
    }
  };

  const doConnect = async () => {
    if (connectingRef.current) return;
    if (!isPro) {
      navigation?.navigate?.("Paywall");
      return;
    }

    connectingRef.current = true;
    setHrStatus("scanning");

    try {
      // ✅ cleanup: evita “busy/ghost connection”
      await disconnectHeartRate();

      // piccola pausa (alcuni stack BLE ne beneficiano)
      await new Promise((r) => setTimeout(r, 250));

      await connectHeartRate();
      // non settiamo "connected" qui: lo farà subscribeHeartRate al primo bpm
    } catch (e) {
      console.log("connectHeartRate error:", e?.message || e);
      setHrStatus("disconnected");
      Alert.alert(
        t("bluetooth.connErrorTitle", { defaultValue: "Errore connessione" }),
        t("bluetooth.connErrorBody", { defaultValue: "Connessione non riuscita. Assicurati che:\n• la fascia sia indossata\n• Bluetooth attivo\n• permessi concessi\n• fascia non sia già connessa ad un altro device" })
      );
    } finally {
      connectingRef.current = false;
    }
  };

  const setAsDefaultAndConnect = async (d) => {
    try {
      // salva solo i campi minimi (robusto per storage/restore)
      const clean = { id: d?.id, name: d?.name || "HR Device" };
      if (!clean.id) return;

      await setDefaultHeartRateDevice(clean);
      const def = await getDefaultHeartRateDevice();
      setDefaultDev(def || clean);

      // connetti subito
      await doConnect();
    } catch (e) {
      console.log("setAsDefaultAndConnect error:", e?.message || e);
      Alert.alert(
      t("settingsScreen.error", { defaultValue: "Errore" }),
      t("bluetooth.saveFail", { defaultValue: "Impossibile salvare o connettere il dispositivo." })
    );
    }
  };

  const clearDefault = async () => {
    try {
      await clearDefaultHeartRateDevice();
      const def = await getDefaultHeartRateDevice();
      setDefaultDev(def || null);

      await disconnectHeartRate();
      setHr(null);
      setHrStatus("disconnected");
    } catch (e) {
      console.log("clearDefault error:", e?.message || e);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectHeartRate();
    } catch (e) {
      console.log("disconnectHeartRate error:", e?.message || e);
    } finally {
      setHr(null);
      setHrStatus("disconnected");
    }
  };

  return (
    <View style={styles.container}>
      <GarminHeader title={t("bluetooth.title", { defaultValue: "Bluetooth" })} subtitle={`${t("bluetooth.subtitle", { defaultValue: "Cardiofrequenzimetro" })} ${badgeText}`} />

      <View style={styles.content}>
        <TouchableOpacity
          style={[styles.btn, status === "scanning" && styles.btnDisabled]}
          onPress={startScan}
          disabled={status === "scanning"}
        >
          <Text style={styles.btnText}>
            {status === "scanning" ? t("bluetooth.scanning", { defaultValue: "SCANSIONE..." }) : t("bluetooth.scan", { defaultValue: "SCANSIONA DISPOSITIVI" })}
          </Text>
        </TouchableOpacity>

        {defaultDev ? (
          <View style={styles.defaultBox}>
            <Text style={styles.defaultTitle}>{t("bluetooth.default", { defaultValue: "Predefinito" })}</Text>
            <Text style={styles.defaultText}>{defaultDev.name}</Text>
            <Text style={styles.defaultSub}>{defaultDev.id}</Text>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: "#37e293" }]}
                onPress={doConnect}
              >
                <Text style={[styles.smallBtnText, { color: "#000" }]}>
                  {hrStatus === "scanning" ? t("bluetooth.connecting", { defaultValue: "CONNETTO..." }) : t("bluetooth.connect", { defaultValue: "CONNETTI" })}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: "#444" }]}
                onPress={clearDefault}
              >
                <Text style={styles.smallBtnText}>{t("common.delete", { defaultValue: "RIMUOVI" })}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <Text style={styles.hint}>{t("bluetooth.noDefault", { defaultValue: "Nessun dispositivo predefinito salvato." })}</Text>
        )}

        <Text style={styles.section}>{t("bluetooth.found", { defaultValue: "Dispositivi trovati" })}</Text>

        <FlatList
          data={devices}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <Text style={styles.hint}>
              {t("bluetooth.noneFound", { defaultValue: "Nessun dispositivo trovato (premi SCANSIONA)." })}
            </Text>
          }
          renderItem={({ item }) => {
            const isDef = defaultDev?.id === item.id;
            return (
              <TouchableOpacity
                style={[styles.row, isDef && styles.rowActive]}
                onPress={() => setAsDefaultAndConnect(item)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.sub}>{item.id}</Text>
                </View>
                <Text style={styles.tag}>{isDef ? t("bluetooth.tagDefault", { defaultValue: "DEFAULT" }) : t("common.save", { defaultValue: "SALVA" })}</Text>
              </TouchableOpacity>
            );
          }}
        />

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: "#444", marginTop: 12 }]}
          onPress={handleDisconnect}
        >
          <Text style={styles.btnText}>{t("settingsScreen.disconnect", { defaultValue: "DISCONNETTI" })}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  content: { flex: 1, padding: 16 },

  btn: {
    backgroundColor: "#1f1f1f",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: "#fff", fontWeight: "800" },

  section: { color: "#aaa", marginTop: 16, marginBottom: 8, fontSize: 13, textTransform: "uppercase" },
  hint: { color: "#777", marginTop: 10 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#222",
    marginBottom: 10,
    backgroundColor: "#0b0b0b",
  },
  rowActive: { borderColor: "#37e293", backgroundColor: "#101f13" },

  name: { color: "#fff", fontWeight: "700", fontSize: 14 },
  sub: { color: "#777", fontSize: 12, marginTop: 2 },
  tag: { color: "#37e293", fontWeight: "900" },

  defaultBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1f1f1f",
    backgroundColor: "#0b0b0b",
  },
  defaultTitle: { color: "#aaa", textTransform: "uppercase", fontSize: 12, marginBottom: 6 },
  defaultText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  defaultSub: { color: "#777", fontSize: 12, marginTop: 2 },

  smallBtn: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10 },
  smallBtnText: { color: "#fff", fontWeight: "800" },
});
