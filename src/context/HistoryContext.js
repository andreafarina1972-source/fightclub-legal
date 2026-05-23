// src/context/HistoryContext.js
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "fightclub_sessions_v1";
const VO2_STORAGE_KEY = "fightclub_vo2_v1";

// Chiavi vecchie (migrazione)
const LEGACY_KEYS = ["fightclub_sessions", "fc_sessions", "STORAGE_SESSIONS", "sessions"];
// ✅ per running: evita sessioni troppo pesanti in storage (gps points)
const MAX_ROUTE_POINTS = 5000;

// downsample uniforme (mantiene primo/ultimo)
function downsampleRoute(points, maxPoints = MAX_ROUTE_POINTS) {
  if (!Array.isArray(points)) return points;
  if (points.length <= maxPoints) return points;

  const out = [];
  const n = points.length;
  out.push(points[0]);

  const step = (n - 2) / (maxPoints - 2);
  for (let i = 1; i < maxPoints - 1; i++) {
    const idx = Math.round(i * step);
    out.push(points[Math.min(n - 2, Math.max(1, idx))]);
  }

  out.push(points[n - 1]);
  return out;
}

function normalizeSessionShape(base) {
  const b = base && typeof base === "object" ? base : {};

  // type/kind: usato da nuove schermate (training/running) senza rompere sessioni vecchie
  const type = (b.type || b.kind || "").toString();

  // running payload può contenere routePoints/route
  let routePoints = b.routePoints ?? b.route ?? null;
  if (Array.isArray(routePoints)) routePoints = downsampleRoute(routePoints);

  return {
    ...b,
    type: type || "workout",
    // normalizza e conserva routePoints per running (se presente)
    ...(Array.isArray(routePoints) ? { routePoints } : {}),
  };
}


const safeParseArray = (raw) => {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

// id robusto (non collide)
const makeId = () => `${Date.now()}_${Math.random().toString(16).slice(2)}`;

// ✅ garantisce ID unici e string
function normalizeSessions(input) {
  const arr = Array.isArray(input) ? input : [];
  const seen = new Set();

  let changed = false;

  const out = arr.map((s) => {
    const base = s && typeof s === "object" ? s : {};
    let id = base.id?.toString?.() ?? "";

    if (!id) {
      id = makeId();
      changed = true;
    }

    // se duplicato -> rigenera
    if (seen.has(id)) {
      id = makeId();
      changed = true;
    }

    seen.add(id);

    // assicura campi minimi senza rompere nulla
    return {
      ...normalizeSessionShape(base),
      id,
      date: base.date ?? new Date().toISOString(),
    };
  });

  return { out, changed };
}

async function persistSessions(next) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

async function persistVo2(next) {
  await AsyncStorage.setItem(VO2_STORAGE_KEY, JSON.stringify(next));
}

async function loadSessionsFromStorage() {
  const rawNew = await AsyncStorage.getItem(STORAGE_KEY);
  if (rawNew) return safeParseArray(rawNew);

  for (const k of LEGACY_KEYS) {
    const raw = await AsyncStorage.getItem(k);
    if (raw) {
      const arr = safeParseArray(raw);
      if (arr.length) {
        // migra nella chiave nuova
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
        return arr;
      }
    }
  }

  return [];
}

const HistoryContext = createContext({
  sessions: [],
  vo2Measurements: [],
  latestVo2: null,
  addSession: async () => {},
  addVo2Measurement: async () => {},
  deleteSessions: async () => {},
  clearHistory: async () => {},
  replaceSessions: async () => {},
  reload: async () => {},
});

export function HistoryProvider({ children }) {
  const [sessions, setSessions] = useState([]);
  const [vo2Measurements, setVo2Measurements] = useState([]);

  // load iniziale + normalizzazione + persist (sessions + VO2)
  useEffect(() => {
    let alive = true;

    (async () => {
      const loaded = await loadSessionsFromStorage();
      const { out, changed } = normalizeSessions(loaded);

      if (!alive) return;
      setSessions(out);

      // ✅ se ho corretto id duplicati, salvo subito
      if (changed) {
        await persistSessions(out);
      }

      // VO2 history
      try {
        const rawVo2 = await AsyncStorage.getItem(VO2_STORAGE_KEY);
        const vo2Arr = rawVo2 ? safeParseArray(rawVo2) : [];
        const { out: vo2Out, changed: vo2Changed } = normalizeSessions(vo2Arr);
        if (!alive) return;
        setVo2Measurements(vo2Out);
        if (vo2Changed) await persistVo2(vo2Out);
      } catch {}
    })();

    return () => {
      alive = false;
    };
  }, []);

  const reload = async () => {
    const loaded = await loadSessionsFromStorage();
    const { out, changed } = normalizeSessions(loaded);
    setSessions(out);
    if (changed) await persistSessions(out);

    try {
      const raw = await AsyncStorage.getItem(VO2_STORAGE_KEY);
      const arr = raw ? safeParseArray(raw) : [];
      const { out: vo2Out, changed: vo2Changed } = normalizeSessions(arr);
      setVo2Measurements(vo2Out);
      if (vo2Changed) await AsyncStorage.setItem(VO2_STORAGE_KEY, JSON.stringify(vo2Out));
    } catch {}
  };

  const replaceSessions = async (nextSessions) => {
    const { out } = normalizeSessions(nextSessions);
    setSessions(out);
    await persistSessions(out);
  };

  // ✅ prepend (più recente sopra) + id robusto
  const addSession = async (session) => {
    if (!session) return;

    const base = session && typeof session === "object" ? session : {};
    const s = {
      ...normalizeSessionShape(base),
      id: base.id?.toString?.() || makeId(),
      date: base.date ?? new Date().toISOString(),
    };

    // se collide con un id già esistente -> rigenera
    if (sessions.some((x) => x?.id?.toString?.() === s.id)) {
      s.id = makeId();
    }

    const next = [s, ...sessions];
    setSessions(next);
    await persistSessions(next);
  };

  // ✅ salva una misurazione VO2 max (prepend come le sessioni)
  // shape consigliata: { value, avgHr, age, method }
  const addVo2Measurement = async (measurement) => {
    if (!measurement) return;
    const base = measurement && typeof measurement === "object" ? measurement : {};

    const m = {
      ...base,
      id: base.id?.toString?.() || makeId(),
      date: base.date ?? new Date().toISOString(),
      value: Number(base.value),
    };

    if (!Number.isFinite(m.value) || m.value <= 0) return;

    // se collide con un id già esistente -> rigenera
    if (vo2Measurements.some((x) => x?.id?.toString?.() === m.id)) {
      m.id = makeId();
    }

    const next = [m, ...vo2Measurements];
    setVo2Measurements(next);
    await persistVo2(next);
  };

  const deleteSessions = async (ids) => {
    const toDelete = new Set((ids || []).map((x) => x?.toString?.()).filter(Boolean));
    if (toDelete.size === 0) return;

    const next = sessions.filter((s) => !toDelete.has(s?.id?.toString?.()));
    setSessions(next);
    await persistSessions(next);
  };

  const clearHistory = async () => {
    setSessions([]);
    setVo2Measurements([]);

    try {
      // ✅ elimina in modo permanente: sessioni + VO2 + chiavi vecchie (migrazione)
      await AsyncStorage.multiRemove([STORAGE_KEY, VO2_STORAGE_KEY, ...LEGACY_KEYS]);
    } catch (e) {
      // fallback
      try {
        await AsyncStorage.removeItem(STORAGE_KEY);
        await AsyncStorage.removeItem(VO2_STORAGE_KEY);
        for (const k of LEGACY_KEYS) {
          await AsyncStorage.removeItem(k);
        }
      } catch {}
    }
  };

  // ✅ ultima misurazione VO2 (più recente)
  const latestVo2 = useMemo(() => {
    if (!Array.isArray(vo2Measurements) || vo2Measurements.length === 0) return null;
    let best = vo2Measurements[0];
    let bestTs = Date.parse(best?.date || "") || Number(best?.id) || 0;
    for (const x of vo2Measurements) {
      const ts = Date.parse(x?.date || "") || Number(x?.id) || 0;
      if (ts > bestTs) {
        best = x;
        bestTs = ts;
      }
    }
    return best || null;
  }, [vo2Measurements]);

  const value = useMemo(
    () => ({
      sessions,
      vo2Measurements,
      latestVo2,
      addSession,
      addVo2Measurement,
      deleteSessions,
      clearHistory,
      replaceSessions,
      reload,
    }),
    [sessions, vo2Measurements, latestVo2]
  );

  return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>;
}

export function useHistoryData() {
  return useContext(HistoryContext);
}
