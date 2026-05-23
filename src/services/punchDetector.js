// src/services/punchDetector.js
import { Audio } from "expo-av";
import AsyncStorage from "@react-native-async-storage/async-storage";

let recording = null;
let interval = null;

// stato globale
let running = false;
let stopping = false;

// session token: invalida loop “in volo” quando fai stop
let sessionId = 0;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isMeteringValid = (m) => m !== undefined && m !== null && !Number.isNaN(m);

function parseSensitivityTo01(raw) {
  let v = Number(raw);
  if (!Number.isFinite(v)) return 0.35;
  if (v > 1) v = v / 100; // supporta 0..100
  return clamp(v, 0, 1);
}

/**
 * Avvia e ritorna una funzione stop “di proprietà” di questa sessione.
 * Solo quello stop potrà fermare questa sessione (token-based).
 */
export async function startPunchDetection(onPunch) {
  if (running || stopping) return () => {};
  running = true;

  // token sessione
  sessionId += 1;
  const mySession = sessionId;

  try {
    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      console.log("❌ Permessi microfono negati");
      running = false;
      return () => {};
    }

    const storedSens = await AsyncStorage.getItem("punchSensitivity");
    const sensitivity01 = parseSensitivityTo01(storedSens);

    const sensitivityEff = clamp(sensitivity01 * 0.2, 0, 1);

    const nfAbs = Number(await AsyncStorage.getItem("punchNoiseFloor"));
    const pkAbs = Number(await AsyncStorage.getItem("punchPeak"));
    const hasCalib =
      Number.isFinite(nfAbs) && Number.isFinite(pkAbs) && pkAbs > 0 && nfAbs > 0;

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      // su Android spesso aiuta a non rompere il recorder quando riproduci suoni
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });

    // cleanup sicurezza
    if (recording) {
      try {
        await recording.stopAndUnloadAsync();
      } catch {}
      recording = null;
    }

    recording = new Audio.Recording();

    await recording.prepareToRecordAsync({
      ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
      isMeteringEnabled: true,
    });

    await recording.startAsync();

    console.log("🥊 Punch detector AVVIATO", {
      hasCalib,
      sensitivity01,
      sensitivityEff,
    });

    const warmupMs = 800;

    // un filo meno sensibile (ok)
    const cooldownMs = 45; // raffiche fitte (limite pratico ~50ms sampling)

    const startTs = Date.now();
    let lastPunchTs = 0;

    let noiseDb = -90;

    // ✅ baseline rumore: segue veloce quando il segnale è basso, lentissimo quando è alto
    const alphaLow = 0.10;
    const alphaHigh = 0.012;

    // ✅ filtri / stato per distinguere colpi (transienti) da voce (sostenuta)
    let prevDb = -90;
    let emaFast = -90;
    let emaSlow = -90;
    let speechTicks = 0;
    let speechModeUntil = 0;

    let armed = true;

    // soglie (le tue “meno sensibili”)
    // ✅ usa sensitivityEff ovunque
    const deltaTriggerDb = (19.5 - sensitivityEff * 5.0) * 0.90; // ✅ +10% sensibilità (soglia più bassa)
    const deltaReleaseDb = 3.5;
    const absMinDb = (-30 - sensitivityEff * 7) * 0.90; // ✅ +10% sensibilità (minimo assoluto meno severo)
    const forceRearmAfterMs = 90; // evita blocchi su segnale sostenuto

    let inLoop = false;

    interval = setInterval(async () => {
      // se qualcuno ha stoppato e creato una nuova sessione, abort
      if (sessionId !== mySession) return;
      if (inLoop) return;

      inLoop = true;
      try {
        if (!recording) return;

        let status;
        try {
          status = await recording.getStatusAsync();
        } catch {
          // recorder killato mentre eravamo in volo -> ignoriamo
          return;
        }

        if (!status || !isMeteringValid(status.metering)) return;

        const now = Date.now();
        if (now - startTs < warmupMs) return;

        const db = status.metering;
        const dbClamped = Math.min(0, Math.max(-160, db));

        // --- filtri di livello (fast/slow) ---
        const aFast = 0.35;
        const aSlow = 0.06;
        emaFast = emaFast + aFast * (dbClamped - emaFast);
        emaSlow = emaSlow + aSlow * (dbClamped - emaSlow);

        const riseDb = dbClamped - prevDb; // dB per ~50ms
        prevDb = dbClamped;

        // --- baseline rumore (non deve "inseguire" colpi/voce) ---
        const provisionalHigh = (dbClamped - noiseDb) >= 6;
        const aNoise = provisionalHigh ? alphaHigh : alphaLow;
        noiseDb = noiseDb + aNoise * (dbClamped - noiseDb);

        const deltaFromNoise = dbClamped - noiseDb;
        const spikeDb = dbClamped - emaSlow;     // picco sopra la media
        const transientDb = dbClamped - emaFast; // picco sopra il livello "veloce"

        // ✅ GATE ANTI-VOCE (aggressivo): se rileviamo parlato sostenuto, disabilitiamo il conteggio per un breve periodo.
        // Obiettivo: la voce NON deve mai contare come colpo.
        const speechLevelDb = 6.0 - sensitivityEff * 1.4; // più basso = più facile classificare come voce
        const speechRiseMax = 3.2;                        // variazione lenta
        const speechSpikeMax = 9.5 - sensitivityEff * 1.0; // la voce può avere spike moderati (sillabe)

        const speechLike =
          deltaFromNoise > speechLevelDb &&
          Math.abs(riseDb) < speechRiseMax &&
          spikeDb < speechSpikeMax &&
          transientDb < (4.8 - sensitivityEff * 1.0);

        if (speechLike) {
          speechTicks += 1;
          if (speechTicks >= 3) {
            speechModeUntil = now + 1400; // blocco più lungo: elimina sillabe/parole dal conteggio
            speechTicks = 0;
          }
        } else {
          speechTicks = Math.max(0, speechTicks - 1);
        }

        // --- trigger colpo (solo transiente) ---
        const minRiseDb = 4.6 - sensitivityEff * 1.0;
        const minSpikeDb = 10.5 - sensitivityEff * 1.8;
        const strongRiseDb = 7.0 - sensitivityEff * 1.0;
        const strongSpikeDb = 17.0 - sensitivityEff * 2.2;

        let triggered =
          deltaFromNoise >= deltaTriggerDb &&
          dbClamped >= absMinDb &&
          (
            (riseDb >= minRiseDb && spikeDb >= minSpikeDb) ||
            spikeDb >= strongSpikeDb ||
            (riseDb >= strongRiseDb && deltaFromNoise >= (deltaTriggerDb + 2))
          );
if (hasCalib) {
          const noiseCalDb = -Math.abs(nfAbs);
          const peakCalDb = -Math.abs(pkAbs);

          if (peakCalDb > noiseCalDb) {
            // ✅ usa sensitivityEff
            const ratio = (0.46 - sensitivityEff * 0.28) * 0.90; // ✅ +10% sensibilità anche in calibrazione
            const thresholdDb = noiseCalDb + ratio * (peakCalDb - noiseCalDb);
            triggered = dbClamped >= thresholdDb;
          }

        // Se siamo in speech mode, NON contare (override totale) — vale anche dopo la calibrazione
        if (now < speechModeUntil) {
          triggered = false;
        }
        }

        if (
          !armed &&
          ((dbClamped - noiseDb) < deltaReleaseDb ||
            now - lastPunchTs > forceRearmAfterMs)
        ) {
          armed = true;
        }

        if (armed && triggered && now - lastPunchTs > cooldownMs) {
          armed = false;
          lastPunchTs = now;
          onPunch?.();
        }
      } finally {
        inLoop = false;
      }
    }, 50);

    // stop “tokenizzato”: ferma solo se è ancora la stessa sessione
    return () => stopPunchDetection(mySession);
  } catch (err) {
    console.log("❌ Errore avvio punch detector:", err);
    running = false;
    return () => {};
  }
}

/**
 * Stop “tokenizzato”: se passi token, ferma solo quella sessione.
 * Se non passi token, ferma comunque (ma noi nei screen useremo il token).
 */
export async function stopPunchDetection(token) {
  // se stop chiamato da una sessione vecchia, ignora
  if (token != null && token !== sessionId) return;

  if (stopping) return;
  stopping = true;

  // invalida loop in volo
  sessionId += 1;

  try {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }

    // IMPORTANTISSIMO: azzera subito i riferimenti prima di await (evita race)
    const rec = recording;
    recording = null;
    running = false;

    if (rec) {
      try {
        await rec.stopAndUnloadAsync();
      } catch {}
    }

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
    } catch {}

    // console.log("🛑 Punch detector STOP");
  } finally {
    stopping = false;
  }
}
