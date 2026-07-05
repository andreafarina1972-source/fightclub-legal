// src/hooks/useTransparentCardExport.js
//
// Cattura la SessionShareCard in modalità `transparent` (sfondo alpha) e la
// condivide come PNG trasparente, pensato per essere importato in un'app di
// montaggio video (CapCut, InShot, Storie IG) e sovrapposto a un video/GIF
// per ottenere una clip animata. Nessun server, nessuna dipendenza nuova.
//
// Utilizzo:
//   const { transparentRef, handleExport, exporting } = useTransparentCardExport(session);
//   <SessionShareCard ref={transparentRef} session={session} transparent />
//   <Pressable onPress={handleExport}>...</Pressable>

import { useRef, useState, useCallback } from "react";
import { Alert } from "react-native";

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

export function useTransparentCardExport(session) {
  const transparentRef = useRef(null);
  const [exporting, setExporting] = useState(false);

  const handleExport = useCallback(async () => {
    if (exporting || !transparentRef.current) return;

    const captureRef = getCaptureRef();
    if (!captureRef) {
      Alert.alert("Non disponibile", "react-native-view-shot richiede un development build.");
      return;
    }

    setExporting(true);
    try {
      // format png = canale alpha preservato; la card ha sfondo trasparente,
      // quindi il PNG risultante avrà lo sfondo effettivamente trasparente.
      const uri = await captureRef(transparentRef, {
        format: "png",
        quality: 1,
        result: "tmpfile",
      });

      // Percorso consigliato: condividere il FILE (lo passa integro all'app di
      // montaggio, mantenendo la trasparenza).
      const Sharing = getSharing();
      if (Sharing && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(uri, {
          mimeType: "image/png",
          dialogTitle: "Esporta la card trasparente (per montaggio video)",
          UTI: "public.png", // iOS
        });
      } else {
        // Fallback: salva nella libreria foto (il PNG conserva l'alpha)
        const MediaLibrary = getMediaLibrary();
        if (MediaLibrary) {
          const { status } = await MediaLibrary.requestPermissionsAsync();
          if (status === "granted") {
            await MediaLibrary.saveToLibraryAsync(uri);
            Alert.alert("Salvata!", "La card trasparente è stata salvata nelle foto.");
          } else {
            Alert.alert("Permesso negato", "Abilita l'accesso alle foto nelle impostazioni.");
          }
        }
      }
    } catch (e) {
      console.log("❌ Export trasparente error:", e?.message);
      Alert.alert("Errore", "Impossibile esportare la card trasparente.");
    } finally {
      setExporting(false);
    }
  }, [exporting, session]);

  return { transparentRef, handleExport, exporting };
}
