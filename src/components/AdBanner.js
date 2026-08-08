// src/components/AdBanner.js
//
// Banner AdMob mostrato SOLO agli utenti Free (isPro === false).
// Se l'utente è Pro, o se l'SDK non è disponibile (Expo Go), non renderizza nulla.
//
// REGOLA D'USO: inserire questo componente solo nelle schermate di lista /
// riepilogo / storico / impostazioni. NON durante una sessione live (timer o
// corsa in corso), per non rovinare l'esperienza nel momento d'uso.

import React from "react";
import { View } from "react-native";
import { usePro } from "../context/ProContext";

function getAds() {
  try { return require("react-native-google-mobile-ads"); }
  catch { return null; }
}

// In sviluppo si usano automaticamente gli ID di test (__DEV__).
const BANNER_UNIT_ANDROID = "ca-app-pub-7888719103540832/7158818175";

export default function AdBanner({ style }) {
  const { isPro } = usePro();
  const Ads = getAds();

  if (isPro || !Ads) return null;

  const { BannerAd, BannerAdSize, TestIds } = Ads;
  const unitId = __DEV__ ? TestIds.BANNER : BANNER_UNIT_ANDROID;

  return (
    <View style={[{ alignItems: "center", width: "100%" }, style]}>
      <BannerAd
        unitId={unitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: false }}
      />
    </View>
  );
}
