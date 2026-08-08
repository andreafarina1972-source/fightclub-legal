// src/screens/PaywallScreen.js
//
// Schermata di acquisto FightClub Pro. Legge le offerte da RevenueCat
// (tramite ProContext), mostra i piani disponibili (annuale, ed eventuale
// mensile / lifetime se configurati nell'offering), gestisce acquisto e
// ripristino. Coerente con l'estetica fight poster (oro/rosso/nero).
//
// Naviga qui con navigation.navigate("Paywall") (registrata nello stack).

import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { usePro } from "../context/ProContext";

const GOLD = "#D4AF37";
const RED = "#FF2E3E";

// Vantaggi elencati nel paywall
const PERKS = [
  "Fight Score e valutazione performance",
  "Fascia cardio, zone e training zone",
  "VO2 max e training load",
  "AI Coach personalizzato",
  "Badge, share card e tessera atleta",
  "Nessun banner pubblicitario",
];

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { offerings, purchase, restore, isPro } = usePro();

  const [busy, setBusy] = useState(false);

  // Pacchetti disponibili nell'offering corrente
  const packages = offerings?.availablePackages || [];

  async function handleBuy(pkg) {
    setBusy(true);
    const ok = await purchase(pkg);
    setBusy(false);
    if (ok) {
      Alert.alert("Benvenuto in Pro! 🥊", "Tutte le funzioni sono sbloccate.");
      navigation.goBack();
    }
  }

  async function handleRestore() {
    setBusy(true);
    const ok = await restore();
    setBusy(false);
    Alert.alert(ok ? "Ripristinato" : "Nessun acquisto", ok ? "Il tuo abbonamento Pro è attivo." : "Non abbiamo trovato acquisti da ripristinare.");
    if (ok) navigation.goBack();
  }

  return (
    <View style={st.root}>
      <View style={[st.band, st.bandA]} pointerEvents="none" />
      <View style={[st.band, st.bandB]} pointerEvents="none" />

      <ScrollView contentContainerStyle={[st.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 }]}>
        <Pressable style={st.close} onPress={() => navigation.goBack()} hitSlop={10}>
          <Text style={st.closeX}>✕</Text>
        </Pressable>

        <Text style={st.badge}>FIGHTCLUB PRO</Text>
        <Text style={st.title}>Sblocca tutta la tua performance</Text>
        <Text style={st.trial}>14 giorni di prova gratuita · disdici quando vuoi</Text>

        {/* Vantaggi */}
        <View style={st.perks}>
          {PERKS.map((p) => (
            <View key={p} style={st.perkRow}>
              <Text style={st.perkTick}>✓</Text>
              <Text style={st.perkText}>{p}</Text>
            </View>
          ))}
        </View>

        {/* Piani */}
        <View style={st.plans}>
          {packages.length === 0 ? (
            <View style={st.center}>
              <ActivityIndicator color={GOLD} />
              <Text style={st.loadingText}>Caricamento piani…</Text>
            </View>
          ) : (
            packages.map((pkg) => {
              const p = pkg.product;
              return (
                <Pressable key={pkg.identifier} style={st.plan} onPress={() => handleBuy(pkg)} disabled={busy}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.planTitle}>{p.title?.replace(/\(.*\)/, "").trim() || pkg.packageType}</Text>
                    {p.description ? <Text style={st.planDesc}>{p.description}</Text> : null}
                  </View>
                  <Text style={st.planPrice}>{p.priceString}</Text>
                </Pressable>
              );
            })
          )}
        </View>

        {busy ? <ActivityIndicator color={GOLD} style={{ marginTop: 12 }} /> : null}

        <Pressable onPress={handleRestore} disabled={busy} hitSlop={8}>
          <Text style={st.restore}>Ripristina acquisti</Text>
        </Pressable>

        <Text style={st.legal}>
          L'abbonamento si rinnova automaticamente al termine della prova salvo disdetta almeno 24h prima.
          Gestibile dalle impostazioni del Play Store.
        </Text>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050508" },
  band: { position: "absolute", left: "-30%", width: "160%", height: 90, transform: [{ rotate: "-8deg" }] },
  bandA: { top: "12%", backgroundColor: "rgba(255,46,62,0.08)" },
  bandB: { bottom: "26%", height: 60, backgroundColor: "rgba(212,175,55,0.05)" },

  content: { paddingHorizontal: 24, alignItems: "center" },
  close: { alignSelf: "flex-end", padding: 6 },
  closeX: { color: "rgba(255,255,255,0.5)", fontSize: 20, fontWeight: "700" },

  badge: { color: GOLD, fontSize: 13, fontWeight: "900", letterSpacing: 3, fontStyle: "italic", marginTop: 6 },
  title: {
    color: "#fff", fontSize: 26, fontWeight: "900", fontStyle: "italic", textTransform: "uppercase",
    textAlign: "center", letterSpacing: -0.4, marginTop: 10,
  },
  trial: { color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: "700", textAlign: "center", marginTop: 8 },

  perks: { alignSelf: "stretch", gap: 10, marginTop: 24, marginBottom: 8 },
  perkRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  perkTick: { color: "#37E293", fontSize: 16, fontWeight: "900" },
  perkText: { color: "rgba(255,255,255,0.9)", fontSize: 14, fontWeight: "700", flex: 1 },

  plans: { alignSelf: "stretch", gap: 10, marginTop: 20 },
  plan: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(6,6,10,0.6)", borderWidth: 1, borderColor: "rgba(212,175,55,0.4)",
    borderRadius: 14, padding: 16,
  },
  planTitle: { color: "#fff", fontSize: 15, fontWeight: "900" },
  planDesc: { color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: "600", marginTop: 2 },
  planPrice: { color: GOLD, fontSize: 18, fontWeight: "900" },

  center: { alignItems: "center", gap: 8, paddingVertical: 20 },
  loadingText: { color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: "700" },

  restore: { color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: "800", textAlign: "center", marginTop: 20 },
  legal: { color: "rgba(255,255,255,0.3)", fontSize: 11, lineHeight: 15, textAlign: "center", marginTop: 16 },
});
