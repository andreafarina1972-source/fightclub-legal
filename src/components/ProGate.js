// src/components/ProGate.js
//
// Wrapper per proteggere contenuti/feature Pro.
// - Se l'utente è Pro: mostra i children normalmente.
// - Se è Free: mostra un'anteprima bloccata (teaser opzionale sfocato/oscurato)
//   con un lucchetto e una CTA che porta al Paywall ("Prova 14 giorni gratis").
//
// Due modi d'uso:
//
// 1) Bloccare un'intera schermata Pro (es. AI Coach, Training Load, VO2, Badge):
//      export default function AiCoachScreen() {
//        return (
//          <ProGate title="AI Coach" fullscreen>
//            ...contenuto reale...
//          </ProGate>
//        );
//      }
//
// 2) Bloccare un elemento dentro una schermata (es. fight score, zone cardio,
//    pulsante condivisione), mostrando come teaser il contenuto reale oscurato:
//      <ProGate title="Fight Score" teaser={<FightScoreBadge value={fs} />} />

import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { usePro } from "../context/ProContext";
import { t } from "../i18n";

export default function ProGate({
  children,
  title,
  subtitle,
  teaser = null,
  fullscreen = false,
}) {
  const { isPro } = usePro();
  const navigation = useNavigation();

  if (isPro) return children;

  return (
    <View style={[st.wrap, fullscreen && st.fullscreen]}>
      {/* Teaser reale oscurato dietro il velo, per creare desiderio */}
      {teaser ? (
        <View style={st.teaser} pointerEvents="none">
          {teaser}
          <View style={StyleSheet.absoluteFillObject} />
        </View>
      ) : null}

      <View style={[StyleSheet.absoluteFillObject, st.veil]} pointerEvents="none" />

      <View style={st.lockCard}>
        <Text style={st.lockIcon}>🔒</Text>
        <Text style={st.lockTitle}>{title || t("common.proFeature") || "Funzione Pro"}</Text>
        <Text style={st.lockSub}>{subtitle || t("common.unlockWithPro") || "Sblocca con FightClub Pro"}</Text>
        <Pressable style={st.cta} onPress={() => navigation.navigate("Paywall")}>
          <Text style={st.ctaText}>{t("common.freeTrialCta") || "Prova 14 giorni gratis"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const GOLD = "#D4AF37";
const RED = "#FF2E3E";

const st = StyleSheet.create({
  wrap: {
    position: "relative",
    minHeight: 160,
    borderRadius: 16,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  fullscreen: { flex: 1, minHeight: undefined, borderRadius: 0, backgroundColor: "#050508" },
  teaser: { ...StyleSheet.absoluteFillObject, opacity: 0.25 },
  veil: { backgroundColor: "rgba(5,5,8,0.72)" },
  lockCard: { alignItems: "center", gap: 8, maxWidth: 300 },
  lockIcon: { fontSize: 34 },
  lockTitle: {
    color: "#fff", fontSize: 18, fontWeight: "900", fontStyle: "italic",
    textTransform: "uppercase", letterSpacing: 0.3, textAlign: "center",
  },
  lockSub: { color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: "700", textAlign: "center" },
  cta: {
    marginTop: 8, paddingVertical: 13, paddingHorizontal: 26, borderRadius: 12,
    backgroundColor: RED,
    shadowColor: RED, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  ctaText: { color: "#fff", fontWeight: "900", fontSize: 15, letterSpacing: 0.5 },
});
