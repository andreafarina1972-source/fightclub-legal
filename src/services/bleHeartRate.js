import { BleManager } from 'react-native-ble-plx';
// FIX #4: Buffer non è disponibile in React Native → usare base64-js
import { toByteArray } from 'base64-js';

const HEART_RATE_SERVICE = '180d';
const HEART_RATE_MEASUREMENT = '2a37';

let manager = null;

function getManager() {
  if (!manager) {
    try {
      manager = new BleManager();
    } catch (e) {
      console.warn('BleManager non disponibile:', e?.message);
    }
  }
  return manager;
}

export function scanForHeartRateMonitor(onDeviceFound) {
  const mgr = getManager();
  if (!mgr) return;
  mgr.startDeviceScan(
    null,
    { allowDuplicates: false },
    (error, device) => {
      if (error) {
        console.warn('BLE scan error', error);
        return;
      }

      // Filtra per dispositivi che espongono il servizio HR
      if (device && device.name && device.name.toLowerCase().includes('hr')) {
        onDeviceFound(device);
      }
    }
  );
}

export async function connectToHeartRateMonitor(device, onHeartRate) {
  try {
    const connectedDevice = await device.connect();
    await connectedDevice.discoverAllServicesAndCharacteristics();

    const services = await connectedDevice.services();
    const hrService = services.find(
      (s) => s.uuid.toLowerCase().includes(HEART_RATE_SERVICE)
    );

    if (!hrService) {
      console.warn('Servizio HR non trovato');
      return;
    }

    const characteristics = await connectedDevice.characteristicsForService(
      hrService.uuid
    );
    const hrChar = characteristics.find((c) =>
      c.uuid.toLowerCase().includes(HEART_RATE_MEASUREMENT)
    );

    if (!hrChar) {
      console.warn('Caratteristica HR non trovata');
      return;
    }

    await connectedDevice.monitorCharacteristicForService(
      hrService.uuid,
      hrChar.uuid,
      (error, characteristic) => {
        if (error) {
          console.warn('Errore monitor HR', error);
          return;
        }
        const value = characteristic?.value;
        if (value) {
          // FIX #4: usa base64-js invece di Buffer (non disponibile in React Native)
          let bytes;
          try { bytes = toByteArray(value); } catch { return; }
          if (!bytes || bytes.length < 2) return;
          const flags = bytes[0];
          const hrFormatUINT16 = flags & 0x01;
          const hr = hrFormatUINT16 && bytes.length >= 3
            ? bytes[1] + (bytes[2] << 8)
            : bytes[1];
          onHeartRate(hr);
        }
      }
    );
  } catch (e) {
    console.warn('Errore connessione HR', e);
  }
}

export function stopScan() {
  const mgr = getManager();
  try { mgr?.stopDeviceScan(); } catch {}
}
