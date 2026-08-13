// src/components/LoadDecisionCard.js
//
// Card del motore decisionale sul carico (services/loadDecision.js).
// Estratta da AiCoachScreen (Fase 2, 13/08/2026) e condivisa con HomeScreen
// (13/08/2026): un solo punto da cambiare se il layout evolve, invece di
// duplicare il JSX fra le due schermate.
//
// Riceve decision/readiness/loading come props, non chiama useLoadDecision()
// da sola: l'hook va invocato UNA SOLA VOLTA nel corpo dello screen che la
// usa (così la stessa decisione già calcolata alimenta anche altro, es.
// doGenerate/buildPrompt in AiCoachScreen — Fase 3) — nessun ricalcolo,
// vincolo esplicito. Nessun dato salute grezzo qui: solo il livello,
// l'headline (chiave i18n), il codice del reason principale (tradotto via
// loadDecision.reasons.<code>), il readiness (solo score + state, mai i
// components) e i flag trasversali.

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { translateReadinessState } from "../services/athleteProfile";
import { t } from "../i18n";

const LEVEL_COLORS = {
  progress: "#37E293",
  maintain: "#2D9CDB",
  reduce:   "#FF9500",
  rest:     "#FF4D6D",
};

export default function LoadDecisionCard({ decision, readiness, loading }) {
  // Caricamento: card leggera, non blocca il resto della schermata (che
  // renderizza comunque sotto, indipendentemente da questo stato).
  if (loading) {
    return (
      <View style={[styles.card, { borderColor: "rgba(255,255,255,0.08)" }]}>
        <Text style={styles.loadingText}>{t("loadDecision.card.loading") || "Calcolo il carico di oggi…"}</Text>
      </View>
    );
  }
  if (!decision) return null;

  // Stato "learning": messaggio onesto sui giorni mancanti, nessun consiglio
  // (né headline colorata di livello, né readiness — non c'è ancora una
  // decisione da corroborare con un numero).
  if (decision.level === "learning") {
    const days = decision.reasons?.[0]?.detail?.daysUntilMedium;
    return (
      <View style={[styles.card, { borderColor: "rgba(255,255,255,0.1)" }]}>
        <Text style={styles.headline}>{t(decision.headline) || "Sto ancora imparando i tuoi ritmi"}</Text>
        <Text style={styles.reason}>
          {Number.isFinite(days)
            ? (t("loadDecision.card.learningDays", { days }) || `Mancano circa ${days} giorni di dati per poterti consigliare con sicurezza.`)
            : (t("loadDecision.card.learningGeneric") || "Sto ancora raccogliendo i tuoi dati per poterti consigliare con sicurezza.")}
        </Text>
      </View>
    );
  }

  const levelColor = LEVEL_COLORS[decision.level] || "#2D9CDB";
  const primaryReason = decision.reasons?.[0];
  const reasonText = primaryReason ? t(`loadDecision.reasons.${primaryReason.code}`) : null;
  const volumePct = decision.suggestedChange?.volumePct;
  const showChange = Number.isFinite(volumePct) && volumePct !== 0;
  const changeValue = volumePct > 0 ? `+${volumePct}` : `${volumePct}`;

  return (
    <View style={[styles.card, { borderColor: levelColor + "33" }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.headline, { color: levelColor }]}>{t(decision.headline) || decision.level}</Text>
        {readiness && (
          <View style={styles.readinessBadge}>
            <Text style={[styles.readinessScore, { color: readiness.color }]}>{readiness.score}</Text>
            <Text style={styles.readinessState}>{translateReadinessState(readiness.state)}</Text>
          </View>
        )}
      </View>

      {reasonText ? <Text style={styles.reason}>{reasonText}</Text> : null}

      {showChange && (
        <Text style={[styles.change, { color: levelColor }]}>
          {t("loadDecision.card.volumeChange", { value: changeValue }) || `Volume ${changeValue}%`}
        </Text>
      )}

      {/* rest: un'indicazione, non un divieto — nessun tono allarmistico */}
      {decision.level === "rest" && (
        <Text style={styles.softNote}>{t("loadDecision.card.restNote") || "È un'indicazione, non un divieto."}</Text>
      )}

      {/* flag possible_illness: suggerisce di considerare un malessere e, se
          persiste, di sentire un medico — mai una diagnosi */}
      {decision.flags?.includes("possible_illness") && (
        <Text style={styles.flagNote}>{t("loadDecision.card.illnessNote") || "Se questi segnali persistono nei prossimi giorni, considera di sentire un medico."}</Text>
      )}

      {/* flag aggressive_weight_cut: invita a un professionista, mai
          indicazioni su come accelerare il calo — area a maggior
          potenziale di danno dell'app (vedi loadDecision.js) */}
      {decision.flags?.includes("aggressive_weight_cut") && (
        <Text style={styles.flagNote}>{t("loadDecision.card.weightCutNote") || "Rivedi la traiettoria del peso con un professionista: qui non trovi indicazioni su come accelerarla."}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#0D0D14", borderRadius: 16, borderWidth: 1, padding: 16, gap: 8 },
  loadingText: { color: "rgba(255,255,255,0.4)", fontSize: 13, fontWeight: "600" },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  headline: { flex: 1, fontSize: 17, fontWeight: "900" },
  reason: { color: "rgba(255,255,255,0.6)", fontSize: 13, lineHeight: 19 },
  change: { fontSize: 13, fontWeight: "800" },
  softNote: { color: "rgba(255,255,255,0.35)", fontSize: 11, fontStyle: "italic" },
  flagNote: { color: "#FF9500", fontSize: 12, lineHeight: 18, fontWeight: "600" },
  readinessBadge: { alignItems: "center", gap: 0 },
  readinessScore: { fontSize: 22, fontWeight: "900" },
  readinessState: { color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3 },
});
