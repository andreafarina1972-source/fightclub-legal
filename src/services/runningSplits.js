// src/services/runningSplits.js
//
// Calcoli derivati dai punti GPS grezzi di una sessione running
// (routePoints: [{lat, lon, t, hr, speed}, ...]):
//   - split per ogni km pieno completato (tempo impiegato + HR max nel tratto)
//   - serie temporale a bucket fissi di HR media e andatura media, per i
//     grafici "Frequenza cardiaca" e "Andatura" nello storico.
//
// Condiviso tra RunningScreen.js (precalcolo al salvataggio, per le sessioni
// future) e HistoryScreen.js (fallback calcolato al volo da routePoints, per
// le sessioni già salvate prima che questi campi esistessero — stesso
// pattern già usato per avgPaceSecPerKm/bestKmPaceSecPerKm in HistoryScreen).

function haversineMeters(a, b) {
  if (!a || !b) return 0;
  const toRad = (x) => (x * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2), sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Split per ogni km pieno completato: tempo impiegato e HR massima toccata
// in quel tratto. Usato per la sezione "Split per km" nello storico.
export function computeKmSplits(routePoints) {
  if (!Array.isArray(routePoints) || routePoints.length < 2) return [];
  const splits = [];
  let cumDist = 0;
  let kmStartT = routePoints[0].t;
  let kmIndex = 1;
  let hrMaxInKm = null;
  for (let i = 0; i < routePoints.length; i++) {
    const p = routePoints[i];
    if (Number.isFinite(p.hr)) hrMaxInKm = hrMaxInKm == null ? p.hr : Math.max(hrMaxInKm, p.hr);
    if (i > 0) {
      const d = haversineMeters(routePoints[i - 1], p);
      if (d >= 0 && d <= 50) cumDist += d;
    }
    if (cumDist >= kmIndex * 1000) {
      const splitSec = (p.t - kmStartT) / 1000;
      if (splitSec > 0) splits.push({ km: kmIndex, splitSec, hrMax: hrMaxInKm });
      kmStartT = p.t;
      hrMaxInKm = null;
      kmIndex += 1;
    }
  }
  return splits;
}

// Serie temporale a bucket fissi (default 30s) di HR media e andatura media.
// L'andatura è calcolata da spostamento reale/tempo tra i fix GPS (non dal
// campo grezzo c.speed del device, spesso inaffidabile — vedi RunningScreen.js).
export function computeTimeSeries(routePoints, bucketSec = 30) {
  if (!Array.isArray(routePoints) || routePoints.length < 2) return [];
  const startT = routePoints[0].t;
  const buckets = new Map();
  for (let i = 0; i < routePoints.length; i++) {
    const p = routePoints[i];
    const elapsedSec = (p.t - startT) / 1000;
    const bIdx = Math.max(0, Math.floor(elapsedSec / bucketSec));
    if (!buckets.has(bIdx)) buckets.set(bIdx, { hrSum: 0, hrCount: 0, distM: 0 });
    const b = buckets.get(bIdx);
    if (Number.isFinite(p.hr)) { b.hrSum += p.hr; b.hrCount += 1; }
    if (i > 0) {
      const d = haversineMeters(routePoints[i - 1], p);
      if (d >= 0 && d <= 50) b.distM += d;
    }
  }
  const maxIdx = Math.max(...buckets.keys());
  const series = [];
  for (let idx = 0; idx <= maxIdx; idx++) {
    const b = buckets.get(idx);
    const t = idx * bucketSec + bucketSec / 2;
    const hr = b && b.hrCount > 0 ? b.hrSum / b.hrCount : null;
    const speedKmh = b ? (b.distM / bucketSec) * 3.6 : null;
    series.push({ t, hr, speedKmh });
  }
  return series;
}

// Ricava splits/timeSeries da una sessione: usa i campi già salvati
// (sessioni future, precalcolati in RunningScreen.js) se presenti, altrimenti
// li calcola al volo da item.routePoints (sessioni salvate prima di questa
// feature, o comunque prive di precalcolo).
export function getKmSplitsForSession(item) {
  if (Array.isArray(item?.kmSplits) && item.kmSplits.length > 0) return item.kmSplits;
  return computeKmSplits(item?.routePoints);
}

export function getTimeSeriesForSession(item) {
  if (Array.isArray(item?.timeSeries) && item.timeSeries.length > 0) return item.timeSeries;
  return computeTimeSeries(item?.routePoints);
}
