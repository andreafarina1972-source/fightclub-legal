// src/components/ShareCardPreviewModal.js
//
// Modal che mostra un'anteprima reale (a schermo, non nascosta) della
// SessionShareCard, così l'utente può vedere l'aspetto della fight card
// prima di condividerla — inclusi lo sfondo custom, il punteggio e le
// statistiche — e da qui può anche cambiare sfondo o condividere subito.
//
// Utilizzo:
//   <ShareCardPreviewModal
//     visible={previewVisible}
//     onClose={() => setPreviewVisible(false)}
//     session={session}
//     backgroundUri={backgroundUri}
//     onPickBackground={pickBackground}
//     onRemoveBackground={removeBackground}
//     onShare={handleShare}
//     sharing={sharing}
//   />

import React, { useState } from "react";
import { Modal, View, Text, Pressable, ScrollView, StyleSheet, Dimensions, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import SessionShareCard from "./SessionShareCard";
import { useTransparentCardExport } from "../hooks/useTransparentCardExport";
import { useSocialCardExport } from "../hooks/useSocialCardExport";
import { SOCIAL_PRESETS } from "../services/socialCardCompose";
import { isAnimatedUri } from "../services/mediaKind";
import { t } from "../i18n";

const SOCIAL_PRESET_OPTIONS = [
  { key: "story", labelKey: "historyScreen.socialExport.presetStory", fallback: "Storie/Reels/TikTok" },
  { key: "feed", labelKey: "historyScreen.socialExport.presetFeed", fallback: "Feed" },
  { key: "square", labelKey: "historyScreen.socialExport.presetSquare", fallback: "Quadrato" },
];

const CARD_NATIVE_WIDTH = 380; // deve combaciare con CARD_W in SessionShareCard.js

export default function ShareCardPreviewModal({
  visible,
  onClose,
  session,
  backgroundUri,
  onPickBackground,
  onRemoveBackground,
  onShare,
  sharing,
}) {
  const insets = useSafeAreaInsets();
  const { transparentRef, handleExport, exporting } = useTransparentCardExport(session);
  const [socialPreset, setSocialPreset] = useState("story");
  const { socialCardRef, onSocialCardLayout, handleSocialExport, exportingSocial } =
    useSocialCardExport(session, backgroundUri);
  // Vero export video mp4 solo su Android (vedi modules/social-video-export);
  // su iOS uno sfondo animato produce comunque un frame fermo, come già oggi
  // per "Condividi" ed "Esporta PNG trasparente".
  const willExportVideo = Platform.OS === "android" && isAnimatedUri(backgroundUri);
  const screenW = Dimensions.get("window").width;
  // Scala la card per adattarla alla larghezza schermo, lasciando un margine
  const scale = Math.min(1, (screenW - 40) / CARD_NATIVE_WIDTH);
  const scaledHeightPlaceholder = 620 * scale; // stima per lo spazio nello scroll, la card reale definisce l'altezza

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={st.backdrop}>
        {/* Istanza nascosta in modalità trasparente, solo per la cattura PNG alpha */}
        <View style={{ position: "absolute", left: -9999, top: 0, opacity: 0 }} pointerEvents="none">
          <SessionShareCard ref={transparentRef} session={session} transparent />
        </View>

        {/* Istanza nascosta separata per l'export social a canvas fisso: onLayout
            misura le dimensioni reali (altezza variabile in base al contenuto)
            per catturare senza deformare la card. Vedi useSocialCardExport. */}
        <View
          style={{ position: "absolute", left: -9999, top: 0, opacity: 0 }}
          pointerEvents="none"
          onLayout={onSocialCardLayout}
        >
          <SessionShareCard ref={socialCardRef} session={session} transparent />
        </View>

        <View style={[st.sheet, { paddingBottom: 24 + insets.bottom }]}>
          <View style={st.header}>
            <Text style={st.title}>Anteprima Fight Card</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={st.closeX}>✕</Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={st.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Wrapper che applica la scala mantenendo lo spazio corretto nello scroll */}
            <View style={{ width: CARD_NATIVE_WIDTH * scale, minHeight: scaledHeightPlaceholder }}>
              <View style={{ transform: [{ scale }], transformOrigin: "top left" }}>
                <SessionShareCard session={session} backgroundUri={backgroundUri} />
              </View>
            </View>

            <View style={st.actions}>
              <Pressable style={st.bgBtn} onPress={onPickBackground}>
                <Text style={st.bgBtnText}>
                  {backgroundUri ? "Cambia sfondo 🖼️" : "Aggiungi sfondo 🖼️"}
                </Text>
              </Pressable>

              {backgroundUri ? (
                <Pressable style={st.removeBtn} onPress={onRemoveBackground}>
                  <Text style={st.removeBtnText}>Rimuovi sfondo</Text>
                </Pressable>
              ) : null}

              <Pressable
                style={[st.shareBtn, sharing && { opacity: 0.6 }]}
                onPress={onShare}
                disabled={sharing}
              >
                <Text style={st.shareBtnText}>
                  {sharing ? "Generando..." : "Condividi 📤"}
                </Text>
              </Pressable>

              <Pressable
                style={[st.exportBtn, exporting && { opacity: 0.6 }]}
                onPress={handleExport}
                disabled={exporting}
              >
                <Text style={st.exportBtnText}>
                  {exporting ? "Esporto..." : "🎬 Esporta PNG trasparente"}
                </Text>
              </Pressable>
            </View>

            <Text style={st.exportHint}>
              Per un video animato: apri il PNG in CapCut, InShot o nelle Storie, mettilo
              sopra un tuo video ed esporta la clip.
            </Text>

            {/* Export a canvas fisso per Stories/Reels/TikTok/Feed/Quadrato:
                percorso separato dalla preview a schermo (vedi useSocialCardExport). */}
            <View style={st.socialBlock}>
              <Text style={st.socialLabel}>
                {t("historyScreen.socialExport.formatLabel") || "Formato"}
              </Text>
              <View style={st.presetRow}>
                {SOCIAL_PRESET_OPTIONS.map((opt) => {
                  const active = socialPreset === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      style={[st.presetPill, active && st.presetPillActive]}
                      onPress={() => setSocialPreset(opt.key)}
                    >
                      <Text style={[st.presetPillText, active && st.presetPillTextActive]}>
                        {t(opt.labelKey) || opt.fallback}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                style={[st.socialExportBtn, exportingSocial && { opacity: 0.6 }]}
                onPress={() => handleSocialExport(socialPreset)}
                disabled={exportingSocial}
              >
                <Text style={st.socialExportBtnText}>
                  {exportingSocial
                    ? (willExportVideo
                        ? (t("historyScreen.socialExport.workingVideo") || "Componendo il video...")
                        : (t("historyScreen.socialExport.working") || "Componendo..."))
                    : (willExportVideo
                        ? (t("historyScreen.socialExport.buttonVideo") || "🎬 Condividi video per Social")
                        : (t("historyScreen.socialExport.button") || "📲 Condividi per Social"))}
                </Text>
              </Pressable>

              <Text style={st.socialHint}>
                {willExportVideo
                  ? (t("historyScreen.socialExport.hintVideo", {
                      w: SOCIAL_PRESETS[socialPreset].width,
                      h: SOCIAL_PRESETS[socialPreset].height,
                    }) ||
                    `Video ${SOCIAL_PRESETS[socialPreset].width}×${SOCIAL_PRESETS[socialPreset].height} px, max 15s, senza audio — ottimizzato per Instagram, TikTok e YouTube Shorts.`)
                  : (t("historyScreen.socialExport.hint", {
                      w: SOCIAL_PRESETS[socialPreset].width,
                      h: SOCIAL_PRESETS[socialPreset].height,
                    }) ||
                    `Immagine ${SOCIAL_PRESETS[socialPreset].width}×${SOCIAL_PRESETS[socialPreset].height} px ottimizzata per Instagram, TikTok e YouTube Shorts.`)}
              </Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#0A0A10",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "88%",
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.25)",
    borderBottomWidth: 0,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  title: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  closeX: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 18,
    fontWeight: "700",
    padding: 4,
  },
  scrollContent: {
    alignItems: "center",
    paddingVertical: 20,
  },
  actions: {
    // ✅ alignSelf: "stretch" perché ora questo blocco vive dentro lo
    // ScrollView (contentContainerStyle ha alignItems:"center", che
    // altrimenti restringerebbe la riga alla larghezza del contenuto
    // invece di occupare tutta la larghezza del foglio)
    alignSelf: "stretch",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  bgBtn: {
    flex: 1,
    minWidth: 140,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "rgba(212,175,55,0.1)",
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.3)",
    alignItems: "center",
  },
  bgBtnText: { color: "#D4AF37", fontWeight: "800", fontSize: 13 },
  removeBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "rgba(255,77,109,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,77,109,0.3)",
    alignItems: "center",
  },
  removeBtnText: { color: "#FF4D6D", fontWeight: "800", fontSize: 13 },
  shareBtn: {
    flexBasis: "100%",
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: "rgba(55,226,147,0.15)",
    borderWidth: 1,
    borderColor: "rgba(55,226,147,0.4)",
    alignItems: "center",
  },
  shareBtnText: { color: "#37E293", fontWeight: "900", fontSize: 14 },
  exportBtn: {
    flexBasis: "100%",
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
  },
  exportBtnText: { color: "rgba(255,255,255,0.9)", fontWeight: "800", fontSize: 13 },
  exportHint: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
    lineHeight: 15,
    paddingHorizontal: 20,
    paddingTop: 8,
    textAlign: "center",
  },

  socialBlock: {
    // ✅ vedi commento in st.actions: stessa necessità di stretch dentro lo ScrollView
    alignSelf: "stretch",
    marginTop: 16,
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    gap: 10,
  },
  socialLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  presetRow: { flexDirection: "row", gap: 8 },
  presetPill: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
  },
  presetPillActive: {
    backgroundColor: "rgba(212,175,55,0.18)",
    borderColor: "#D4AF37",
  },
  presetPillText: { color: "rgba(255,255,255,0.6)", fontWeight: "800", fontSize: 12 },
  presetPillTextActive: { color: "#D4AF37" },
  socialExportBtn: {
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: "rgba(212,175,55,0.15)",
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.4)",
    alignItems: "center",
  },
  socialExportBtnText: { color: "#D4AF37", fontWeight: "900", fontSize: 14 },
  socialHint: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
    lineHeight: 15,
    textAlign: "center",
  },
});
