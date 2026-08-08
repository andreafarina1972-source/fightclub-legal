// src/screens/AthleteCardScreen.js
//
// Schermata d'ingresso scenografica in stile "tessera atleta" (variante card
// giocatore, foto a mezzobusto). Mostrata all'avvio dell'app prima della Home:
// l'utente vede la propria tessera e tocca "ENTRA" per proseguire.
//
// - Foto e nickname caricati dall'utente e persistiti in AsyncStorage
//   (nessun server). La foto usa expo-image-picker, già in progetto.
// - Statistiche (best score / sessioni / streak) calcolate dallo storico
//   sessioni tramite getSessions().
// - Nessuna autenticazione: è puramente scenografica.
//
// Uso (in App.js):
//   const [entered, setEntered] = useState(false);
//   {!entered ? <AthleteCardScreen onEnter={() => setEntered(true)} /> : <AppNavigazione />}

import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ATHLETE_CARD_DEFAULT_IMAGE } from "../assets/athleteCardDefaultImage";

import { getAthleteProfile, saveAthleteProfile } from "../services/storage";
import { useHistoryData } from "../context/HistoryContext";
import { usePro } from "../context/ProContext";
import { t } from "../i18n";

// Lazy require per non crashare se il modulo nativo non è presente (Expo Go)
function getImagePicker() {
  try { return require("expo-image-picker"); }
  catch { return null; }
}

// ─────────────────────────────────────────────────────────
// HELPERS STATISTICHE
// ─────────────────────────────────────────────────────────
function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// Chiave giorno locale (evita problemi di fuso rispetto a toISOString)
function localDayKey(d) {
  const dt = new Date(d);
  if (isNaN(dt)) return null;
  return `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
}

function computeStats(sessions) {
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return { bestScore: 0, count: 0, streak: 0, discipline: null, memberSince: null };
  }

  // Best fight score
  let bestScore = 0;
  let runningCount = 0;
  let boxingCount = 0;
  let minYear = Infinity;
  const dayKeys = new Set();

  for (const s of sessions) {
    bestScore = Math.max(bestScore, safeNum(s?.fightScorePeak));

    const type = (s?.type || "boxing").toLowerCase();
    if (type === "running") runningCount++; else boxingCount++;

    const raw = s?.date || s?.createdAt;
    const key = localDayKey(raw);
    if (key) dayKeys.add(key);
    const yr = new Date(raw).getFullYear();
    if (Number.isFinite(yr)) minYear = Math.min(minYear, yr);
  }

  // Streak: giorni consecutivi con almeno una sessione, a partire da oggi
  // (o da ieri, così non si azzera prima dell'allenamento odierno).
  let streak = 0;
  const cursor = new Date();
  if (!dayKeys.has(localDayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!dayKeys.has(localDayKey(cursor))) {
      streak = 0;
      cursor.setDate(cursor.getDate() + 1); // ripristina, nessuno streak attivo
    }
  }
  if (dayKeys.has(localDayKey(cursor))) {
    while (dayKeys.has(localDayKey(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
  }

  const discipline = runningCount > boxingCount ? "running" : "boxing";
  const memberSince = Number.isFinite(minYear) ? minYear : new Date().getFullYear();

  return { bestScore, count: sessions.length, streak, discipline, memberSince };
}

// ─────────────────────────────────────────────────────────
// SCHERMATA
// ─────────────────────────────────────────────────────────
export default function AthleteCardScreen({ onEnter, onRequestPro }) {
  const insets = useSafeAreaInsets();
  const { isPro } = usePro();
  const { sessions } = useHistoryData();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState({ nickname: "", photoUri: null });
  const [photoLoadError, setPhotoLoadError] = useState(false);

  const [nameModal, setNameModal] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  // Statistiche calcolate dallo storico reale (stessa fonte della schermata Storico)
  const stats = useMemo(() => computeStats(sessions), [sessions]);

  // Carica profilo atleta
  useEffect(() => {
    (async () => {
      try {
        const p = await getAthleteProfile();
        if (p) setProfile({ nickname: p.nickname || "", photoUri: p.photoUri || null });
      } catch (e) {
        console.log("Errore caricamento tessera:", e?.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const persist = useCallback(async (next) => {
    setProfile(next);
    setPhotoLoadError(false);
    await saveAthleteProfile(next);
  }, []);

  const pickPhoto = useCallback(async () => {
    if (!isPro) {
      onRequestPro?.();
      return;
    }
    const ImagePicker = getImagePicker();
    if (!ImagePicker) {
      Alert.alert(t("common.unavailable") || "Non disponibile", t("athleteCard.pickerUnavailable") || "expo-image-picker richiede un development build.");
      return;
    }
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert(t("common.permissionDenied") || "Permesso negato", t("athleteCard.photoPermission") || "Consenti l'accesso alle foto per impostare la tua immagine.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions ? ImagePicker.MediaTypeOptions.Images : ["images"],
        allowsEditing: true,
        aspect: [4, 5], // mezzobusto verticale
        quality: 0.9,
      });
      if (result.canceled) return;
      const uri = result.assets?.[0]?.uri;
      if (uri) await persist({ ...profile, photoUri: uri });
    } catch (e) {
      console.log("Errore selezione foto:", e?.message);
      Alert.alert(t("common.error") || "Errore", t("athleteCard.photoError") || "Impossibile selezionare l'immagine.");
    }
  }, [profile, persist, isPro, onRequestPro]);

  const removePhoto = useCallback(() => {
    if (!profile.photoUri) return;
    Alert.alert(t("athleteCard.removePhotoTitle") || "Rimuovere la foto?", null, [
      { text: t("common.cancel") || "Annulla", style: "cancel" },
      { text: t("common.remove") || "Rimuovi", style: "destructive", onPress: () => persist({ ...profile, photoUri: null }) },
    ]);
  }, [profile, persist]);

  const openNameEditor = useCallback(() => {
    if (!isPro) {
      onRequestPro?.();
      return;
    }
    setNameDraft(profile.nickname || "");
    setNameModal(true);
  }, [profile.nickname, isPro, onRequestPro]);

  const saveName = useCallback(async () => {
    await persist({ ...profile, nickname: nameDraft.trim() });
    setNameModal(false);
  }, [profile, nameDraft, persist]);

  const hasProfile = !!(profile.nickname || profile.photoUri);
  const isRunning = stats.discipline === "running";
  const nick = profile.nickname?.trim() || t("athleteCard.yourName") || "IL TUO NOME";

  if (loading) {
    return (
      <View style={[st.root, st.center]}>
        <ActivityIndicator color="#D4AF37" />
      </View>
    );
  }

  return (
    <View style={st.root}>
      {/* SFONDO scenografico: spotlight + bande diagonali */}
      <View style={st.spot} pointerEvents="none" />
      <View style={[st.band, st.bandA]} pointerEvents="none" />
      <View style={[st.band, st.bandB]} pointerEvents="none" />

      {/* Angoli a bandiera */}
      <View style={st.cornerTL} pointerEvents="none" />
      <View style={st.cornerBR} pointerEvents="none" />

      <View style={[st.wrap, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 24 }]}>
        {/* RIBBON */}
        <View style={st.ribbon}>
          <View style={st.badge}>
            <Text style={st.badgeText}>{t("athleteCard.badge") || "TESSERA ATLETA"}</Text>
          </View>
          <Text style={st.brand}>FIGHTCLUB</Text>
        </View>

        {/* CARD CENTRALE */}
        <View style={st.card}>
          {/* FOTO mezzobusto */}
          <Pressable onPress={pickPhoto} onLongPress={removePhoto} style={st.portrait}>
            <Image
              source={profile.photoUri && !photoLoadError ? { uri: profile.photoUri } : ATHLETE_CARD_DEFAULT_IMAGE}
              style={st.portraitImg}
              resizeMode="cover"
              onError={() => setPhotoLoadError(true)}
            />
            <View style={st.portraitInner} pointerEvents="none" />
            {/* Indizio "tocca per cambiare" — sempre visibile, con o senza foto propria */}
            <View style={st.changeHint} pointerEvents="none">
              <Text style={st.changeHintText}>
                {profile.photoUri && !photoLoadError
                  ? (t("athleteCard.changePhoto") || "Tocca per cambiare immagine")
                  : (t("athleteCard.addPhoto") || "Tocca per aggiungere la tua foto")}
              </Text>
            </View>
            {/* Targhetta nome in sovrimpressione */}
            <View style={st.namePlate} pointerEvents="none">
              <Text style={st.nick} numberOfLines={1}>{nick}</Text>
            </View>
          </Pressable>

          {/* Meta: anno + disciplina */}
          <View style={st.subRow}>
            <Text style={st.memberSince}>{(t("athleteCard.memberSince") || "Membro dal")} {stats.memberSince ?? new Date().getFullYear()}</Text>
            <View style={st.dot} />
            <View style={[st.discChip, isRunning && st.discChipRunning]}>
              <Text style={[st.discChipText, isRunning && { color: "#2D9CDB" }]}>
                {isRunning ? (t("athleteCard.running") || "🏃 RUNNING") : (t("athleteCard.boxing") || "🥊 BOXING")}
              </Text>
            </View>
          </View>

          {/* STATISTICHE */}
          <View style={st.stats}>
            <View style={st.stat}>
              <Text style={[st.statValue, st.gold]}>{stats.bestScore > 0 ? stats.bestScore : "--"}</Text>
              <Text style={st.statLabel}>{t("athleteCard.bestScore") || "Best Score"}</Text>
            </View>
            <View style={st.stat}>
              <Text style={st.statValue}>{stats.count}</Text>
              <Text style={st.statLabel}>{t("athleteCard.sessions") || "Sessioni"}</Text>
            </View>
            <View style={st.stat}>
              <Text style={st.statValue}>{stats.streak}</Text>
              <Text style={st.statLabel}>{t("athleteCard.streak") || "Streak"}</Text>
            </View>
          </View>

          {/* Modifica nome */}
          <Pressable onPress={openNameEditor} hitSlop={8}>
            <Text style={st.editName}>
              {hasProfile ? (t("athleteCard.editName") || "✎ Modifica nome") : (t("athleteCard.createCard") || "✎ Crea la tua tessera")}
            </Text>
          </Pressable>
        </View>

        {/* AZIONE: ENTRA */}
        <Pressable style={st.enter} onPress={onEnter}>
          <Text style={st.enterText}>{t("athleteCard.enter") || "ENTRA"}</Text>
        </Pressable>
      </View>

      {/* MODAL modifica nickname */}
      <Modal visible={nameModal} transparent animationType="fade" onRequestClose={() => setNameModal(false)}>
        <View style={st.modalBackdrop}>
          <View style={st.modalCard}>
            <Text style={st.modalTitle}>{t("athleteCard.nameModalTitle") || "Il tuo nome da fighter"}</Text>
            <TextInput
              style={st.input}
              value={nameDraft}
              onChangeText={setNameDraft}
              placeholder={t("athleteCard.namePlaceholder") || "Es. El Toro"}
              placeholderTextColor="rgba(255,255,255,0.3)"
              maxLength={20}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={saveName}
            />
            <View style={st.modalActions}>
              <Pressable style={st.modalBtnGhost} onPress={() => setNameModal(false)}>
                <Text style={st.modalBtnGhostText}>{t("common.cancel") || "Annulla"}</Text>
              </Pressable>
              <Pressable style={st.modalBtnPrimary} onPress={saveName}>
                <Text style={st.modalBtnPrimaryText}>{t("common.save") || "Salva"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// STILI
// ─────────────────────────────────────────────────────────
const GOLD = "#D4AF37";
const RED = "#FF2E3E";

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050508" },
  center: { alignItems: "center", justifyContent: "center" },

  spot: {
    position: "absolute", top: -80, alignSelf: "center",
    width: 320, height: 320, borderRadius: 160,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  band: { position: "absolute", left: "-30%", width: "160%", height: 90, transform: [{ rotate: "-8deg" }] },
  bandA: { top: "10%", backgroundColor: "rgba(255,46,62,0.10)" },
  bandB: { bottom: "24%", height: 60, backgroundColor: "rgba(212,175,55,0.06)" },

  cornerTL: {
    position: "absolute", top: 0, left: 0, width: 0, height: 0,
    borderTopWidth: 46, borderRightWidth: 46,
    borderTopColor: "rgba(255,46,62,0.85)", borderRightColor: "transparent",
  },
  cornerBR: {
    position: "absolute", bottom: 0, right: 0, width: 0, height: 0,
    borderBottomWidth: 34, borderLeftWidth: 34,
    borderBottomColor: "rgba(212,175,55,0.75)", borderLeftColor: "transparent",
  },

  wrap: { flex: 1, paddingHorizontal: 26, justifyContent: "space-between" },

  ribbon: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  badge: {
    paddingHorizontal: 9, paddingVertical: 5, borderRadius: 4,
    backgroundColor: "rgba(255,46,62,0.18)", borderWidth: 1, borderColor: "rgba(255,46,62,0.55)",
  },
  badgeText: { color: "#FF6B78", fontSize: 9, fontWeight: "900", letterSpacing: 1.4 },
  brand: { color: GOLD, fontSize: 14, fontWeight: "900", letterSpacing: 2, fontStyle: "italic" },

  card: { flex: 1, alignItems: "center", justifyContent: "center", gap: 18 },

  portrait: {
    width: 250, height: 330, borderRadius: 20,
    borderWidth: 3, borderColor: GOLD, overflow: "hidden",
    backgroundColor: "#0a0a10",
  },
  portraitImg: { width: "100%", height: "100%" },
  portraitInner: {
    position: "absolute", top: 6, left: 6, right: 6, bottom: 6,
    borderRadius: 15, borderWidth: 1, borderColor: "rgba(212,175,55,0.4)",
  },
  changeHint: {
    position: "absolute", top: 12, left: 10, right: 10,
    alignItems: "center",
  },
  changeHintText: {
    color: "rgba(255,255,255,0.9)", fontSize: 11, fontWeight: "700", textAlign: "center",
    backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10,
    overflow: "hidden",
  },

  namePlate: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.78)",
    paddingTop: 24, paddingBottom: 12, paddingHorizontal: 10,
  },
  nick: {
    color: "#fff", fontSize: 26, fontWeight: "900", fontStyle: "italic",
    textTransform: "uppercase", letterSpacing: -0.5, textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.6)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4,
  },

  subRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  memberSince: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: "700" },
  dot: { width: 3, height: 3, borderRadius: 99, backgroundColor: "rgba(255,255,255,0.3)" },
  discChip: {
    paddingHorizontal: 9, paddingVertical: 3, borderRadius: 99,
    backgroundColor: "rgba(255,46,62,0.15)", borderWidth: 1, borderColor: "rgba(255,46,62,0.4)",
  },
  discChipRunning: { backgroundColor: "rgba(45,156,219,0.15)", borderColor: "rgba(45,156,219,0.4)" },
  discChipText: { color: "#FF6B78", fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },

  stats: { flexDirection: "row", gap: 10, width: "100%" },
  stat: {
    flex: 1, backgroundColor: "rgba(6,6,10,0.55)",
    borderWidth: 1, borderColor: "rgba(212,175,55,0.3)", borderRadius: 12,
    paddingVertical: 12, alignItems: "center",
  },
  statValue: { color: "#fff", fontSize: 20, fontWeight: "900", lineHeight: 22 },
  gold: { color: GOLD },
  statLabel: {
    color: "rgba(255,255,255,0.5)", fontSize: 8, fontWeight: "800",
    letterSpacing: 1, textTransform: "uppercase", marginTop: 5,
  },

  editName: { color: "rgba(255,255,255,0.45)", fontSize: 12, fontWeight: "700", textAlign: "center" },

  enter: {
    borderRadius: 14, paddingVertical: 16, alignItems: "center",
    backgroundColor: RED,
    shadowColor: RED, shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  enterText: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 1 },

  // Modal nome
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", alignItems: "center", justifyContent: "center", padding: 30 },
  modalCard: {
    width: "100%", backgroundColor: "#0F0F16", borderRadius: 18,
    borderWidth: 1, borderColor: "rgba(212,175,55,0.3)", padding: 20, gap: 14,
  },
  modalTitle: { color: "#fff", fontSize: 16, fontWeight: "900" },
  input: {
    backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: "#fff", fontSize: 16, fontWeight: "700",
  },
  modalActions: { flexDirection: "row", gap: 10, justifyContent: "flex-end" },
  modalBtnGhost: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.06)" },
  modalBtnGhostText: { color: "rgba(255,255,255,0.7)", fontWeight: "800", fontSize: 14 },
  modalBtnPrimary: { paddingHorizontal: 20, paddingVertical: 11, borderRadius: 10, backgroundColor: GOLD },
  modalBtnPrimaryText: { color: "#0A0A0F", fontWeight: "900", fontSize: 14 },
});
