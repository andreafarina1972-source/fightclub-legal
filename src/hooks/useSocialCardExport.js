// src/hooks/useSocialCardExport.js
//
// Cattura la SessionShareCard in modalità trasparente (solo contenuto,
// niente sfondo né velo — la stessa modalità già usata da
// useTransparentCardExport) e la compone su un canvas a dimensione fissa
// per i formati social (Stories/Reels/TikTok 1080×1920, Feed 1080×1350,
// Quadrato 1080×1080), poi condivide il PNG risultante.
// Vedi src/services/socialCardCompose.js per la logica di composizione.
//
// Non modifica useShareSession / useTransparentCardExport: è un percorso
// di esportazione separato, con una propria istanza nascosta della card.
//
// Utilizzo:
//   const { socialCardRef, onSocialCardLayout, handleSocialExport, exportingSocial } =
//     useSocialCardExport(session, backgroundUri);
//   <View
//     style={{ position: "absolute", left: -9999, top: 0, opacity: 0 }}
//     pointerEvents="none"
//     onLayout={onSocialCardLayout}
//   >
//     <SessionShareCard ref={socialCardRef} session={session} transparent />
//   </View>
//   <Pressable onPress={() => handleSocialExport("story")}>...</Pressable>

import { useRef, useState, useCallback } from "react";
import { Alert, Platform } from "react-native";
import {
  composeSocialCard,
  getCardCaptureWidth,
  getCardPlacement,
  SOCIAL_PRESETS,
  VEIL_ALPHA_255,
} from "../services/socialCardCompose";
import { isAnimatedUri } from "../services/mediaKind";
import { t } from "../i18n";

// Lazy require per evitare crash se il modulo nativo non è ancora installato
// (coerente con useShareSession / useTransparentCardExport).
function getCaptureRef() {
  try { return require("react-native-view-shot").captureRef; }
  catch { return null; }
}
function getSharing() {
  try { return require("expo-sharing"); }
  catch { return null; }
}
function getMediaLibrary() {
  try { return require("expo-media-library"); }
  catch { return null; }
}
function getFileSystem() {
  // API "legacy" (writeAsStringAsync + cacheDirectory + EncodingType):
  // stessa forma delle altre utility di file già presenti nel progetto,
  // più semplice della nuova API a classi File/Directory di expo-file-system 19.
  try { return require("expo-file-system/legacy"); }
  catch { return null; }
}
// Modulo nativo locale (solo Android, vedi modules/social-video-export):
// compone sfondo video/gif + velo + card frame per frame e incoda un mp4.
// Import a percorso relativo (non è un pacchetto npm), lazy per non rompere
// iOS/web dove il modulo nativo non esiste.
function getSocialVideoExport() {
  if (Platform.OS !== "android") return null;
  try { return require("../../modules/social-video-export/src/SocialVideoExportModule").default; }
  catch { return null; }
}

// Durata massima esportata da uno sfondo video/gif e frame rate dell'mp4
// risultante: coerenti con i limiti di Stories/Reels, tengono sotto controllo
// tempo di elaborazione e peso del file (vedi modules/social-video-export).
//
// ✅ Verificato su device reale: 12fps dava troppo poco margine per frame
// (83ms) rispetto al tempo reale di MediaMetadataRetriever.getFrameAtTime()
// per sorgenti video (anche non 4K) — il pacing adattivo del modulo nativo
// scartava fino al 50% dei frame per restare a ritmo, risultando "a scatti".
// 8fps (125ms/frame, +50% di margine) mantiene comunque un mp4 fluido a
// sufficienza per un contenuto di sfondo, riducendo sensibilmente gli scarti.
const VIDEO_MAX_DURATION_MS = 15000;
const VIDEO_FPS = 8;

// ✅ Verificato su device: se `backgroundUri` punta a un file non più
// presente su disco (es. cache di expo-image-picker svuotata dal sistema
// mentre l'uri restava salvato in AsyncStorage), Skia.Data.fromURI() non
// solleva un errore JS gestibile — resta bloccata a tempo indeterminato
// (sembra un blocco sincrono del thread JS, non solo una Promise che non
// risolve: anche un timeout via setTimeout attorno a quella chiamata non
// scatta mai). L'unica difesa efficace è non arrivarci mai: verifichiamo
// che il file esista ancora PRIMA di passarlo alla composizione Skia.
async function resolveExistingBackgroundUri(FileSystem, uri) {
  if (!uri) return null;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info?.exists ? uri : null;
  } catch {
    return null;
  }
}

export function useSocialCardExport(session, backgroundUri) {
  const socialCardRef = useRef(null);
  // Dimensioni renderizzate della card (in punti), misurate via onLayout:
  // servono per catturare alla risoluzione giusta senza deformarla (la
  // card ha larghezza fissa ma altezza dipendente dal contenuto).
  const cardLayoutRef = useRef(null);
  const [exportingSocial, setExportingSocial] = useState(false);

  const onSocialCardLayout = useCallback((e) => {
    cardLayoutRef.current = e.nativeEvent.layout;
  }, []);

  const handleSocialExport = useCallback(async (preset = "story") => {
    if (exportingSocial || !socialCardRef.current) return;

    const captureRef = getCaptureRef();
    const FileSystem = getFileSystem();
    if (!captureRef || !FileSystem) {
      Alert.alert(
        t("historyScreen.socialExport.unavailableTitle") || "Non disponibile",
        t("historyScreen.socialExport.unavailableBody") || "Richiede una development build."
      );
      return;
    }

    const layout = cardLayoutRef.current;
    if (!layout || !layout.width || !layout.height) {
      // onLayout non è ancora scattato: meglio segnalarlo che catturare
      // una card con proporzioni sbagliate.
      Alert.alert(
        t("historyScreen.socialExport.errorTitle") || "Errore",
        t("historyScreen.socialExport.notReadyBody") || "Riprova tra un istante."
      );
      return;
    }

    setExportingSocial(true);
    try {
      const captureWidth = getCardCaptureWidth(preset);
      const captureHeight = Math.round(layout.height * (captureWidth / layout.width));

      // Verifica che lo sfondo custom esista ancora su disco (vedi commento
      // su resolveExistingBackgroundUri): se è sparito, si procede senza
      // sfondo invece di rischiare l'hang di Skia / un errore nativo.
      const safeBackgroundUri = await resolveExistingBackgroundUri(FileSystem, backgroundUri);

      const SocialVideoExport = getSocialVideoExport();
      const useVideoPath = !!SocialVideoExport && isAnimatedUri(safeBackgroundUri);

      if (useVideoPath) {
        // ── Percorso video: sfondo animato (video o gif) → mp4 reale ──
        // Solo Android (vedi getSocialVideoExport). Cattura la card come
        // FILE (non base64: il nativo legge un path, niente giri a vuoto
        // di encoding/decoding).
        const cardFileUri = await captureRef(socialCardRef, {
          format: "png",
          quality: 1,
          result: "tmpfile",
          width: captureWidth,
          height: captureHeight,
        });

        const { width: canvasWidth, height: canvasHeight } =
          SOCIAL_PRESETS[preset] || SOCIAL_PRESETS.story;
        const placement = getCardPlacement(preset, captureWidth, captureHeight);
        const outputUri = `${FileSystem.cacheDirectory}fightclub-social-${preset}-${Date.now()}.mp4`;

        const finalUri = await SocialVideoExport.composeSocialVideo({
          sourceUri: safeBackgroundUri,
          cardUri: cardFileUri,
          outputUri,
          canvasWidth,
          canvasHeight,
          cardX: placement.x,
          cardY: placement.y,
          cardWidth: placement.width,
          cardHeight: placement.height,
          veilAlpha: VEIL_ALPHA_255,
          maxDurationMs: VIDEO_MAX_DURATION_MS,
          fps: VIDEO_FPS,
        });

        const Sharing = getSharing();
        if (Sharing && (await Sharing.isAvailableAsync())) {
          await Sharing.shareAsync(finalUri, {
            mimeType: "video/mp4",
            dialogTitle: t("historyScreen.socialExport.dialogTitle") || "Condividi per i social",
          });
        } else {
          const MediaLibrary = getMediaLibrary();
          if (MediaLibrary) {
            const { status } = await MediaLibrary.requestPermissionsAsync();
            if (status === "granted") {
              await MediaLibrary.saveToLibraryAsync(finalUri);
              Alert.alert(
                t("historyScreen.socialExport.savedTitle") || "Salvata!",
                t("historyScreen.socialExport.savedBody") || "Il video è stato salvato nelle foto."
              );
            } else {
              Alert.alert(
                t("historyScreen.socialExport.permissionDeniedTitle") || "Permesso negato",
                t("historyScreen.socialExport.permissionDeniedBody") || "Abilita l'accesso alle foto nelle impostazioni."
              );
            }
          }
        }
        return;
      }

      // ── Percorso PNG statico (foto, o sfondo animato su iOS/senza modulo
      //    nativo: prende comunque un frame fermo, stesso limite noto già
      //    documentato per "Condividi" e "Esporta PNG trasparente") ──
      const cardBase64 = await captureRef(socialCardRef, {
        format: "png",
        quality: 1,
        result: "base64",
        width: captureWidth,
        height: captureHeight,
      });

      const finalBase64 = await composeSocialCard({
        cardBase64,
        backgroundUri: safeBackgroundUri,
        preset,
      });

      const fileUri = `${FileSystem.cacheDirectory}fightclub-social-${preset}-${Date.now()}.png`;
      await FileSystem.writeAsStringAsync(fileUri, finalBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const Sharing = getSharing();
      if (Sharing && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "image/png",
          dialogTitle: t("historyScreen.socialExport.dialogTitle") || "Condividi per i social",
          UTI: "public.png", // iOS
        });
      } else {
        // Fallback: salva nella libreria foto
        const MediaLibrary = getMediaLibrary();
        if (MediaLibrary) {
          const { status } = await MediaLibrary.requestPermissionsAsync();
          if (status === "granted") {
            await MediaLibrary.saveToLibraryAsync(fileUri);
            Alert.alert(
              t("historyScreen.socialExport.savedTitle") || "Salvata!",
              t("historyScreen.socialExport.savedBody") || "L'immagine è stata salvata nelle foto."
            );
          } else {
            Alert.alert(
              t("historyScreen.socialExport.permissionDeniedTitle") || "Permesso negato",
              t("historyScreen.socialExport.permissionDeniedBody") || "Abilita l'accesso alle foto nelle impostazioni."
            );
          }
        }
      }
    } catch (e) {
      console.log("❌ Social export error:", e?.message);
      Alert.alert(
        t("historyScreen.socialExport.errorTitle") || "Errore",
        t("historyScreen.socialExport.errorBody") || "Impossibile generare il contenuto per i social."
      );
    } finally {
      setExportingSocial(false);
    }
  }, [exportingSocial, backgroundUri, session]);

  return { socialCardRef, onSocialCardLayout, handleSocialExport, exportingSocial };
}
