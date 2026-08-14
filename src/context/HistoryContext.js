// src/context/HistoryContext.js
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { sessionDurationMin } from "../services/trainingLoad";
import { scheduleRpeNotification, cancelRpeNotification } from "../services/rpeNotifications";

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
    // sRPE (BRIEF-srpe.md, Fase 1, 13/08/2026) — additivo: i record storici
    // senza questi campi restano validi, tutti null finché non raccolti.
    // Solo modello dati qui: nessuna UI li scrive ancora, li scriverà
    // setSessionRpe sotto quando la Fase 2 collegherà una schermata.
    rpe: b.rpe ?? null,                       // Borg CR10, intero 0-10
    loadSrpe: b.loadSrpe ?? null,             // rpe * sessionDurationMin(session)
    rpeCollectedAt: b.rpeCollectedAt ?? null, // ISO, quando l'atleta ha risposto la prima volta
    rpeDelayMin: b.rpeDelayMin ?? null,       // minuti da session.date alla risposta
    rpeEdited: b.rpeEdited ?? null,           // true se rpe è stato corretto dopo la prima risposta
    // sRPE Fase 2 (13/08/2026) — ISO di quando la richiesta è stata
    // MOSTRATA (notifica toccata o prompt in-app), indipendentemente dalla
    // risposta. Serve solo a "massimo una richiesta per sessione" nel
    // percorso in-app (RpePromptModal.js): senza, ogni apertura app
    // riproporrebbe la stessa sessione ignorata.
    rpePromptedAt: b.rpePromptedAt ?? null,
    // sRPE Fase 2bis (13/08/2026) — identifier restituito da
    // scheduleNotificationAsync, per poter cancellare ESPLICITAMENTE la
    // notifica quando non serve più (RPE raccolto o richiesta ignorata via
    // "Salta"): vedi setSessionRpe/markRpePrompted sotto. Nullo se non è
    // mai stata pianificata nessuna notifica, o dopo che è stata cancellata.
    rpeNotificationId: b.rpeNotificationId ?? null,
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
  setSessionRpe: async () => {},
  markRpePrompted: async () => {},
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

  // sRPE Fase 2bis (13/08/2026) — salva sul record sessione l'identifier
  // restituito da scheduleNotificationAsync, così setSessionRpe/
  // markRpePrompted possono cancellare ESPLICITAMENTE quella notifica
  // invece di affidarsi a un comportamento non documentato (vedi commit).
  // Interna: nessuna schermata la chiama, solo addSession sotto, dopo che
  // la pianificazione (asincrona, permesso incluso) è andata a buon fine.
  //
  // Usa la forma funzionale di setSessions invece di leggere `sessions`
  // dalla closure: questa funzione viene invocata dentro un .then() legato
  // al render in cui addSession è stata chiamata, cioè PRIMA che la nuova
  // sessione entri nello stato — leggere `sessions` qui vedrebbe sempre
  // l'array precedente e non troverebbe mai l'id (bug osservato: la
  // cancellazione non funzionava mai perché rpeNotificationId restava
  // sempre null). La forma funzionale riceve invece lo stato più recente
  // a prescindere da quale render ha creato questa chiusura.
  const attachRpeNotificationId = (sessionId, notificationId) => {
    const id = sessionId?.toString?.();
    if (!id) return;
    setSessions((prev) => {
      const idx = prev.findIndex((s) => s?.id?.toString?.() === id);
      if (idx === -1) return prev;
      const session = prev[idx];
      // Se nel frattempo l'atleta ha già risposto o saltato, non ha senso
      // agganciare un id che verrebbe subito ricancellato — e soprattutto
      // non bisogna resuscitare un rpeNotificationId su una sessione già
      // "chiusa".
      if (session.rpe != null || session.rpePromptedAt != null) return prev;
      const next = [...prev];
      next[idx] = { ...session, rpeNotificationId: notificationId };
      persistSessions(next);
      return next;
    });
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

    // sRPE Fase 2 (13/08/2026) — fire-and-forget, mai atteso: se le
    // notifiche sono negate o il modulo non è disponibile, la funzione
    // stessa degrada in silenzio (vedi rpeNotifications.js). Non deve mai
    // rallentare né far fallire il salvataggio della sessione. L'identifier
    // (se la notifica è stata pianificata) viene agganciato al record
    // appena disponibile, per permettere una cancellazione esplicita più
    // avanti (vedi attachRpeNotificationId sopra).
    scheduleRpeNotification(s).then((notificationId) => {
      if (notificationId) attachRpeNotificationId(s.id, notificationId);
    });
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

  // sRPE (BRIEF-srpe.md, Fase 1) — calcola loadSrpe e persiste. Solo modello
  // dati: nessuna schermata la chiama ancora (Fase 2/3, non in questo
  // intervento). Gestisce sia la prima risposta sia una correzione
  // successiva con la stessa funzione, così la UI futura (qualunque sia)
  // non deve distinguere i due casi:
  //   - prima risposta (session.rpe ancora null): imposta rpeCollectedAt =
  //     adesso e calcola rpeDelayMin da session.date (fine sessione, per
  //     costruzione: tutte le schermate che chiamano addSession scrivono
  //     date al momento del salvataggio, subito dopo la fine) a adesso.
  //   - correzione (session.rpe già valorizzato): rpeCollectedAt e
  //     rpeDelayMin restano quelli della prima risposta (non ricostruibili
  //     a posteriori, per esplicita richiesta del brief), si aggiorna solo
  //     rpe/loadSrpe e si marca rpeEdited: true.
  const setSessionRpe = async (sessionId, rpe) => {
    const id = sessionId?.toString?.();
    if (!id) return;

    // Borg CR10: intero 0-10. Qualunque altro valore viene ignorato (nessun
    // dato inventato, vedi "Nessun ricalcolo retroattivo" nel brief — lo
    // stesso principio si applica a un valore fuori scala in ingresso).
    const rpeNum = Number(rpe);
    if (!Number.isFinite(rpeNum) || rpeNum < 0 || rpeNum > 10 || !Number.isInteger(rpeNum)) return;

    const idx = sessions.findIndex((s) => s?.id?.toString?.() === id);
    if (idx === -1) return;
    const session = sessions[idx];

    // loadSrpe null se la durata manca — meglio un buco che un numero
    // inventato (stesso principio esplicito del brief per rpe/durata).
    const durationMin = sessionDurationMin(session);
    const loadSrpe = durationMin > 0 ? Math.round(rpeNum * durationMin) : null;

    const isFirstResponse = session.rpe == null;
    const now = new Date();

    let rpeCollectedAt = session.rpeCollectedAt;
    let rpeDelayMin = session.rpeDelayMin;
    if (isFirstResponse) {
      rpeCollectedAt = now.toISOString();
      const sessionEndMs = Date.parse(session.date || "");
      rpeDelayMin = Number.isFinite(sessionEndMs) ? Math.round((now.getTime() - sessionEndMs) / 60000) : null;
    }

    const updated = {
      ...session,
      rpe: rpeNum,
      loadSrpe,
      rpeCollectedAt,
      rpeDelayMin,
      rpeEdited: isFirstResponse ? session.rpeEdited : true,
      // sRPE Fase 2bis — l'RPE è raccolto, la notifica (se pianificata) non
      // serve più: cancellata esplicitamente sotto, poi l'id viene tolto dal
      // record (nulla da ricancellare in una eventuale correzione successiva).
      rpeNotificationId: null,
    };

    const next = [...sessions];
    next[idx] = updated;
    setSessions(next);
    await persistSessions(next);

    // Cancellazione esplicita, DOPO la persistenza: l'RPE è già salvato a
    // prescindere dall'esito della cancellazione (fire-and-forget, silenziosa
    // per costruzione — vedi rpeNotifications.js). Senza, la notifica
    // arriverebbe comunque a chiedere lo sforzo di una sessione già valutata.
    if (session.rpeNotificationId) {
      cancelRpeNotification(session.rpeNotificationId);
    }
  };

  // sRPE Fase 2 (13/08/2026) — segna che la richiesta è stata MOSTRATA
  // (notifica toccata senza rispondere, o prompt in-app ignorato/saltato),
  // senza toccare rpe. Usata da RpePromptModal.js per non riproporre la
  // stessa sessione nel percorso in-app: "massimo una richiesta per
  // sessione" del brief. Se la sessione ha già risposto (rpe non null),
  // non fa nulla — non c'è bisogno di marcarla, il filtro di
  // RpePromptModal la esclude già via rpe.
  const markRpePrompted = async (sessionId) => {
    const id = sessionId?.toString?.();
    if (!id) return;

    const idx = sessions.findIndex((s) => s?.id?.toString?.() === id);
    if (idx === -1) return;
    const session = sessions[idx];
    if (session.rpePromptedAt != null) return;

    const next = [...sessions];
    // sRPE Fase 2bis — richiesta ignorata esplicitamente ("Salta", backdrop
    // o tasto indietro): l'atleta ha deciso di non rispondere ora, la
    // notifica (se pianificata) non deve comunque arrivare più tardi a
    // chiedere lo sforzo di una sessione già rifiutata.
    next[idx] = { ...session, rpePromptedAt: new Date().toISOString(), rpeNotificationId: null };
    setSessions(next);
    await persistSessions(next);

    if (session.rpeNotificationId) {
      cancelRpeNotification(session.rpeNotificationId);
    }
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
      setSessionRpe,
      markRpePrompted,
    }),
    [sessions, vo2Measurements, latestVo2]
  );

  return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>;
}

export function useHistoryData() {
  return useContext(HistoryContext);
}
