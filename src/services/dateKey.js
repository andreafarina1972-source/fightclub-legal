// src/services/dateKey.js
//
// Chiave data locale "YYYY-MM-DD", usata per raggruppare/deduplicare
// record "un valore per giorno" (check-in soggettivo in aiCoach.js, e in
// futuro il record recovery in services/health/ — stessa convenzione).
//
// Usa i getter locali (getFullYear/getMonth/getDate), MAI toISOString()
// che restituisce UTC: un evento delle 00:30 in un fuso avanti rispetto a
// UTC verrebbe attribuito al giorno precedente, e il comportamento
// cambierebbe con l'ora legale/solare a seconda del periodo dell'anno.

export function localDateKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Come localDateKey, ma usa il fuso REGISTRATO SUL RECORD (offsetSeconds,
// da Health Connect/HealthKit: zoneOffset al momento della misurazione),
// non il fuso corrente del dispositivo che legge il dato. Serve per
// l'attribuzione del sonno al giorno di risveglio: un atleta che dorme a
// New York e il cui telefono sincronizza dopo essere rientrato in Italia
// deve vedere la notte attribuita al giorno percepito laggiù, non
// ricalcolato nel fuso di lettura. Aritmetica pura in UTC: sposta il
// timestamp dell'offset richiesto e legge Y/M/D come se fosse UTC — non
// dipende in alcun modo dal fuso del dispositivo che esegue il codice.
export function localDateKeyAtOffset(date, offsetSeconds) {
  const d = date instanceof Date ? date : new Date(date);
  const shifted = new Date(d.getTime() + offsetSeconds * 1000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
