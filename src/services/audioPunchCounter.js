/**
 * Stub per conteggio colpi da microfono.
 *
 * API:
 * - startPunchDetection(onPunch) => avvia rilevamento, chiama onPunch() ad ogni colpo
 * - stopPunchDetection()
 *
 * In produzione sostituirai l'interno con:
 * - inizializzazione modulo nativo che streamma audio
 * - analisi PCM e rilevamento picchi sopra una soglia di sensibilità
 */

let intervalId = null;

export function startPunchDetection(onPunch, sensitivity = 0.5) {
  // TODO: integrare modulo audio nativo.
  // PER ORA: SIMULAZIONE -> genera colpi casuali in base alla "sensibilità"
  stopPunchDetection();
  const baseInterval = 1500; // ms
  const factor = 1 - sensitivity; // 0–1
  const interval = Math.max(400, baseInterval * factor);

  intervalId = setInterval(() => {
    // Simula 1 colpo
    onPunch();
  }, interval);
}

export function stopPunchDetection() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
