// src/hooks/useShareBackground.js
//
// Hook che gestisce la scelta, il salvataggio e la rimozione dello sfondo
// personalizzato (foto o GIF) usato nella fight-card di condivisione.
// Lo sfondo è persistito in AsyncStorage e riusato per tutte le sessioni
// finché l'utente non lo cambia o lo rimuove.
//
// Utilizzo:
//   const { backgroundUri, loading, pickBackground, removeBackground } = useShareBackground();
//   <SessionShareCard ref={shareRef} session={session} backgroundUri={backgroundUri} />

import { useState, useEffect, useCallback } from "react";
import { Alert } from "react-native";
import { getShareBackground, saveShareBackground, clearShareBackground } from "../services/storage";

// Lazy require per evitare crash se il modulo nativo non è ancora installato
// (es. in Expo Go prima del prebuild, o prima di `npx expo install`)
function getImagePicker() {
  try { return require("expo-image-picker"); }
  catch { return null; }
}

export function useShareBackground() {
  const [backgroundUri, setBackgroundUri] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const saved = await getShareBackground();
      setBackgroundUri(saved || null);
      setLoading(false);
    })();
  }, []);

  const pickBackground = useCallback(async () => {
    const ImagePicker = getImagePicker();
    if (!ImagePicker) {
      Alert.alert(
        "Non disponibile",
        "expo-image-picker non è installato. Esegui: npx expo install expo-image-picker (richiede un development build)."
      );
      return;
    }

    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert("Permesso negato", "Consenti l'accesso alle foto per scegliere uno sfondo.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        // Immagini (incluse gif) + video: lo sfondo animato viene poi
        // instradato al percorso di export video nativo, vedi
        // src/services/mediaKind.js e useSocialCardExport.
        mediaTypes: ["images", "videos"],
        quality: 1,
        allowsEditing: false,
      });

      if (result.canceled) return;

      const uri = result.assets?.[0]?.uri;
      if (!uri) return;

      setBackgroundUri(uri);
      await saveShareBackground(uri);
    } catch (e) {
      console.log("❌ Errore selezione sfondo:", e?.message);
      Alert.alert("Errore", "Impossibile selezionare l'immagine.");
    }
  }, []);

  const removeBackground = useCallback(async () => {
    setBackgroundUri(null);
    await clearShareBackground();
  }, []);

  return { backgroundUri, loading, pickBackground, removeBackground };
}
