// src/services/useHeartRate.js
import { useEffect, useRef, useState } from "react";
import { BleManager } from "react-native-ble-plx";
import { Buffer } from "buffer";

const HR_SERVICE = "180D";
const HR_MEASUREMENT = "2A37";

export default function useHeartRate() {
  const managerRef = useRef(new BleManager());
  const [hr, setHr] = useState(null);
  const [device, setDevice] = useState(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    return () => {
      managerRef.current?.destroy();
    };
  }, []);

  const startScan = () => {
    setScanning(true);
    managerRef.current.startDeviceScan(null, null, (error, dev) => {
      if (error) {
        console.log("Errore scan BLE:", error);
        setScanning(false);
        return;
      }
      if (!dev?.serviceUUIDs) return;

      if (dev.serviceUUIDs.includes(HR_SERVICE)) {
        setDevice(dev);
        managerRef.current.stopDeviceScan();
        setScanning(false);
        connectToDevice(dev);
      }
    });
  };

  const connectToDevice = async (dev) => {
    try {
      const connected = await dev.connect();
      await connected.discoverAllServicesAndCharacteristics();
      const services = await connected.services();

      const hrService = services.find((s) => s.uuid.includes(HR_SERVICE.toLowerCase()));
      if (!hrService) return;

      const chars = await connected.characteristicsForService(hrService.uuid);
      const hrChar = chars.find((c) => c.uuid.includes(HR_MEASUREMENT.toLowerCase()));
      if (!hrChar) return;

      await connected.monitorCharacteristicForService(
        hrService.uuid,
        hrChar.uuid,
        (error, characteristic) => {
          if (error) {
            console.log("Errore HR notify:", error);
            return;
          }
          if (!characteristic?.value) return;

          const raw = Buffer.from(characteristic.value, "base64");
          // parsing base HR BLE: primo byte flags, secondo HR
          const hrVal = raw[1];
          setHr(hrVal);
        }
      );
    } catch (e) {
      console.log("Errore connessione HR:", e);
    }
  };

  return {
    hr,
    device,
    scanning,
    startScan,
  };
}
