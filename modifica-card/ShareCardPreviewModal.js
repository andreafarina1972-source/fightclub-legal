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

import React from "react";
import { Modal, View, Text, Pressable, ScrollView, StyleSheet, Dimensions } from "react-native";
import SessionShareCard from "./SessionShareCard";

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
  const screenW = Dimensions.get("window").width;
  // Scala la card per adattarla alla larghezza schermo, lasciando un margine
  const scale = Math.min(1, (screenW - 40) / CARD_NATIVE_WIDTH);
  const scaledHeightPlaceholder = 620 * scale; // stima per lo spazio nello scroll, la card reale definisce l'altezza

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={st.backdrop}>
        <View style={st.sheet}>
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
          </ScrollView>

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
          </View>
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
    paddingBottom: 24,
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
});
