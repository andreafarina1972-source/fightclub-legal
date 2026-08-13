// src/hooks/useLoadDecision.js
//
// Orchestra le letture necessarie al motore decisionale sul carico
// (computeLoadDecision, services/loadDecision.js) e restituisce la
// decisione già pronta per la UI. Fase 2 del brief motore decisionale:
// oggi lo usa solo AiCoachScreen (la card in cima alla schermata), ma
// tiene insieme cinque servizi diversi — trainingLoad, recovery storage,
// recovery baseline, readiness, periodizzazione, check-in — così una
// schermata futura che ne avrà bisogno non deve reimportarli uno per uno.
//
// Si calcola SUBITO al mount, non dopo la generazione di un piano AI:
// l'atleta deve poter sapere se allenarsi oggi senza spendere una chiamata
// AI (vincolo esplicito della Fase 2). Nessuna dipendenza dal piano/dalla
// generazione — questo hook non tocca aiCoach.generateAiPlan.

import { useEffect, useMemo, useState } from "react";
import { useHistoryData } from "../context/HistoryContext";
import { computeTrainingLoad } from "../services/trainingLoad";
import { loadRecoveryRecords } from "../services/health/recoveryStorage";
import { computeRecoveryBaseline } from "../services/health/recoveryBaseline";
import { loadCheckIns } from "../services/aiCoach";
import { loadAthleteProfile, computeReadiness, computePeriodization } from "../services/athleteProfile";
import { computeLoadDecision } from "../services/loadDecision";
import { localDateKey } from "../services/dateKey";

/**
 * @returns {{ decision: object|null, readiness: object|null, loading: boolean }}
 *   decision/readiness sono null finché loading è true. loading non deve
 *   mai bloccare il resto della schermata che usa l'hook — il chiamante
 *   decide come renderizzare l'attesa (vedi AiCoachScreen).
 */
export function useLoadDecision() {
  const { sessions } = useHistoryData();
  // null = non ancora caricato, distinto da [] (caricato ma vuoto).
  const [recoveryRecords, setRecoveryRecords] = useState(null);
  const [checkIns, setCheckIns] = useState(null);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [rr, ci, p] = await Promise.all([
        loadRecoveryRecords(),
        loadCheckIns(),
        loadAthleteProfile(),
      ]);
      if (cancelled) return;
      setRecoveryRecords(rr);
      setCheckIns(ci);
      setProfile(p);
    })();
    return () => { cancelled = true; };
  }, []);

  const loading = recoveryRecords === null || checkIns === null || profile === null;

  return useMemo(() => {
    if (loading) return { decision: null, readiness: null, loading: true };

    const trainingLoad = computeTrainingLoad(sessions, 90);
    const baseline = computeRecoveryBaseline(recoveryRecords, 28);

    const todayKey = localDateKey(new Date());
    const checkInToday = checkIns.find((c) => {
      const ts = Date.parse(c?.date || "");
      return Number.isFinite(ts) && localDateKey(new Date(ts)) === todayKey;
    }) || null;

    // hrTrend non calcolato qui (a differenza di athleteData in
    // AiCoachScreen, che lo stima da sessions per il prompt AI): influisce
    // solo sulla componente HR del punteggio readiness mostrato in card,
    // mai sulle regole del motore (che usano baseline.hrv.trend,
    // oggettivo) — tenerlo fuori evita di duplicare qui una logica già
    // locale allo screen (estimateHrTrend).
    const readiness = computeReadiness({
      tsb: trainingLoad.current.tsb,
      hrTrend: null,
      checkIn: checkInToday,
      atl: trainingLoad.current.atl,
      recovery: baseline,
    });

    const phase = computePeriodization(profile?.nextMatchDate ?? null);

    const decision = computeLoadDecision({
      trainingLoad,
      readiness,
      baseline,
      checkIn: checkInToday,
      recoveryRecords,
      sessions,
      phase,
    });

    return { decision, readiness, loading: false };
  }, [loading, sessions, recoveryRecords, checkIns, profile]);
}
