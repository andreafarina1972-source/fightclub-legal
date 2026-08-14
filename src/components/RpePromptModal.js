// src/components/RpePromptModal.js
//
// sRPE (BRIEF-srpe.md, Fase 2) — UI di raccolta, montata una volta vicino
// alla radice dell'app (vedi App.js). Due percorsi, stessa UI:
//
//   - PRIMARIO: notifica toccata (src/services/rpeNotifications.js segnala
//     l'id sessione) — si apre direttamente, senza passare dalla home.
//   - SECONDARIO: scansione in-app al mount, se la notifica non ha già
//     deciso — cerca la sessione più a rischio di scadere (le 24h) fra
//     quelle senza rpe e non ancora proposte (rpePromptedAt null). UNA
//     SOLA volta per apertura app: non riconsiderata se `sessions` cambia
//     più tardi nella stessa sessione d'uso (altrimenti finire un nuovo
//     allenamento riaprirebbe subito il prompt — non richiesto dal brief).
//
// Scala Borg CR10: un tap seleziona E invia, nessuna conferma aggiuntiva
// ("ogni tap in più riduce il tasso di risposta", brief). Dismissione
// (backdrop, tasto indietro Android, o "Salta") conta come "richiesta
// mostrata e ignorata": marca rpePromptedAt, non riproposta.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, Modal } from "react-native";
import { useHistoryData } from "../context/HistoryContext";
import { subscribeRpeNotificationResponse, getInitialRpeNotificationSessionId } from "../services/rpeNotifications";
import { t } from "../i18n";

// Oltre questa finestra dalla fine sessione, il ricordo dell'intensità non
// è più affidabile (brief): la richiesta scade, in entrambi i percorsi.
const RPE_WINDOW_HOURS = 24;
const RPE_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function withinWindow(session) {
  const ms = Date.parse(session?.date || "");
  if (!Number.isFinite(ms)) return false;
  return Date.now() - ms <= RPE_WINDOW_HOURS * 3600 * 1000;
}

export default function RpePromptModal() {
  const { sessions, setSessionRpe, markRpePrompted } = useHistoryData();
  const [activeId, setActiveId] = useState(null);
  const [notifChecked, setNotifChecked] = useState(false);
  // true non appena una sessione viene proposta (notifica o scansione), per
  // tutta la durata di questa apertura app — vedi commento in testa al file.
  const shownRef = useRef(false);

  useEffect(() => {
    if (activeId) shownRef.current = true;
  }, [activeId]);

  // Percorso primario: cold start (app aperta toccando la notifica) +
  // listener per tap mentre l'app è già in esecuzione. Il tap ha sempre
  // priorità: è una scelta esplicita dell'atleta in quel momento.
  useEffect(() => {
    let alive = true;
    getInitialRpeNotificationSessionId().then((id) => {
      if (!alive) return;
      if (id) setActiveId(id);
      setNotifChecked(true);
    });
    const unsub = subscribeRpeNotificationResponse((id) => {
      if (alive) setActiveId(id);
    });
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  // Percorso secondario: scansione in-app. Aspetta che il check notifica
  // (cold start) sia risolto per evitare una corsa fra i due percorsi che
  // scelgono sessioni diverse; ripete finché sessions non è ancora caricato
  // da HistoryProvider (innocuo: se non trova nulla, non fa nulla), ma mai
  // dopo che una sessione è già stata proposta in questa apertura.
  useEffect(() => {
    if (!notifChecked) return;
    if (shownRef.current) return;

    const candidates = sessions
      .filter((s) => s?.id != null && s.rpe == null && s.rpePromptedAt == null && withinWindow(s))
      .sort((a, b) => Date.parse(a.date || 0) - Date.parse(b.date || 0));
    if (candidates.length > 0) setActiveId(candidates[0].id.toString());
  }, [sessions, notifChecked]);

  const activeSession = activeId
    ? sessions.find((s) => s?.id?.toString?.() === activeId && s.rpe == null && withinWindow(s))
    : null;

  const close = useCallback(() => setActiveId(null), []);

  const handleSelect = useCallback(
    (value) => {
      if (!activeSession) return;
      setSessionRpe(activeSession.id, value);
      close();
    },
    [activeSession, setSessionRpe, close]
  );

  const handleSkip = useCallback(() => {
    if (!activeSession) return;
    markRpePrompted(activeSession.id);
    close();
  }, [activeSession, markRpePrompted, close]);

  if (!activeSession) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleSkip}>
      <Pressable style={styles.backdrop} onPress={handleSkip}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>
            {t("rpe.question") || "Quanto è stata impegnativa la sessione, nel complesso?"}
          </Text>

          <View style={styles.grid}>
            {RPE_VALUES.map((v) => (
              <Pressable key={v} style={styles.dot} onPress={() => handleSelect(v)}>
                <Text style={styles.dotText}>{v}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.legend}>
            {t("rpe.legend") ||
              "0-1 riposo · 2-3 leggero · 4-5 moderato · 6-7 impegnativo · 8-9 molto impegnativo · 10 massimale"}
          </Text>

          <Pressable style={styles.skip} onPress={handleSkip}>
            <Text style={styles.skipText}>{t("rpe.skip") || "Salta"}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(5,5,8,0.75)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#0D0D14",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    padding: 20,
    gap: 16,
  },
  title: { color: "#fff", fontSize: 17, fontWeight: "800", lineHeight: 23 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  dot: {
    width: 46,
    height: 46,
    borderRadius: 99,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  dotText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  legend: { color: "rgba(255,255,255,0.4)", fontSize: 11, lineHeight: 16, textAlign: "center" },
  skip: { alignSelf: "center", paddingVertical: 8, paddingHorizontal: 16 },
  skipText: { color: "rgba(255,255,255,0.4)", fontSize: 13, fontWeight: "700" },
});
