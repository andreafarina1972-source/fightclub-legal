// src/hooks/useShareSession.js
//
// Hook che gestisce tutta la logica di cattura e condivisione
// della share card. Usa react-native-view-shot + expo-sharing.
//
// Utilizzo:
//   const { shareRef, handleShare, sharing } = useShareSession(session);
//   <SessionShareCard ref={shareRef} session={session} />
//   <Pressable onPress={handleShare}>...</Pressable>

import { useRef, useState, useCallback } from "react";
import { Platform, Alert } from "react-native";

// Lazy load per evitare crash in Expo Go
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

export function useShareSession(session) {
  const shareRef = useRef(null);
  const [sharing, setSharing] = useState(false);

  const handleShare = useCallback(async () => {
    if (sharing || !shareRef.current) return;

    const captureRef = getCaptureRef();
    if (!captureRef) {
      Alert.alert("Non disponibile", "react-native-view-shot richiede un development build.");
      return;
    }

    setSharing(true);
    try {
      // 1. Cattura la card come PNG ad alta risoluzione
      const uri = await captureRef(shareRef, {
        format: "png",
        quality: 1,
        result: "tmpfile",
      });

      // 2. Condivide via sistema nativo
      const Sharing = getSharing();
      if (Sharing && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(uri, {
          mimeType: "image/png",
          dialogTitle: "Condividi il tuo allenamento",
          UTI: "public.png", // iOS
        });
      } else {
        // Fallback: salva nella libreria foto
        const MediaLibrary = getMediaLibrary();
        if (MediaLibrary) {
          const { status } = await MediaLibrary.requestPermissionsAsync();
          if (status === "granted") {
            await MediaLibrary.saveToLibraryAsync(uri);
            Alert.alert("Salvata!", "La card è stata salvata nelle foto.");
          } else {
            Alert.alert("Permesso negato", "Abilita l'accesso alle foto nelle impostazioni.");
          }
        }
      }
    } catch (e) {
      console.log("❌ Share error:", e?.message);
      Alert.alert("Errore", "Impossibile generare la share card.");
    } finally {
      setSharing(false);
    }
  }, [sharing, session]);

  return { shareRef, handleShare, sharing };
}