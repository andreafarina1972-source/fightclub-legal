// src/context/ProContext.js
//
// Provider dell'entitlement "Pro" basato su RevenueCat (react-native-purchases).
// Espone `isPro` a tutta l'app e le azioni per acquistare / ripristinare.
// Il trial di 14 giorni, l'annuale, l'eventuale lifetime e il decadimento a Free
// sono gestiti da RevenueCat + Google Play: quando l'abbonamento non è più
// attivo, `entitlements.active["pro"]` sparisce e `isPro` torna false → l'app
// mostra di nuovo i banner e blocca le feature Pro.
//
// Setup necessario (vedi ISTRUZIONI): prodotto abbonamento su Play Console con
// 14 giorni di prova, entitlement "pro" e offering su RevenueCat, API key Android.

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

// Lazy require: non crasha in Expo Go o prima del development build
function getPurchases() {
  try { return require("react-native-purchases").default; }
  catch { return null; }
}

const ENTITLEMENT_ID = "pro";
// ⚠️ Sostituisci con la tua API key Android da RevenueCat (Project settings → API keys)
const RC_API_KEY_ANDROID = "goog_XXXXXXXXXXXXXXXXXXXXXXXX";

const ProContext = createContext({
  isPro: false,
  loading: true,
  offerings: null,
  purchase: async () => false,
  restore: async () => false,
  refresh: async () => {},
});

const DEV_FORCE_PRO = false; // build locale per test sviluppatore, non toccare in produzione

export function ProProvider({ children }) {
  const [isPro, setIsPro] = useState(DEV_FORCE_PRO ? true : false);
  const [loading, setLoading] = useState(true);
  const [offerings, setOfferings] = useState(null);

  useEffect(() => {
    if (DEV_FORCE_PRO) { setLoading(false); return; }
    const Purchases = getPurchases();
    if (!Purchases) { setLoading(false); return; }

    let listener = null;
    (async () => {
      try {
        Purchases.configure({ apiKey: RC_API_KEY_ANDROID });

        const info = await Purchases.getCustomerInfo();
        setIsPro(!!info?.entitlements?.active?.[ENTITLEMENT_ID]);

        try {
          const offs = await Purchases.getOfferings();
          setOfferings(offs?.current || null);
        } catch (e) {
          console.log("RC offerings error:", e?.message);
        }

        listener = (i) => setIsPro(!!i?.entitlements?.active?.[ENTITLEMENT_ID]);
        Purchases.addCustomerInfoUpdateListener(listener);
      } catch (e) {
        console.log("RC init error:", e?.message);
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      const Purchases = getPurchases();
      if (Purchases && listener) {
        try { Purchases.removeCustomerInfoUpdateListener(listener); } catch {}
      }
    };
  }, []);

  const refresh = useCallback(async () => {
    const Purchases = getPurchases();
    if (!Purchases) return;
    try {
      const info = await Purchases.getCustomerInfo();
      setIsPro(!!info?.entitlements?.active?.[ENTITLEMENT_ID]);
    } catch (e) { console.log("RC refresh error:", e?.message); }
  }, []);

  const purchase = useCallback(async (pkg) => {
    const Purchases = getPurchases();
    if (!Purchases || !pkg) return false;
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const pro = !!customerInfo?.entitlements?.active?.[ENTITLEMENT_ID];
      setIsPro(pro);
      return pro;
    } catch (e) {
      if (!e?.userCancelled) console.log("RC purchase error:", e?.message);
      return false;
    }
  }, []);

  const restore = useCallback(async () => {
    const Purchases = getPurchases();
    if (!Purchases) return false;
    try {
      const info = await Purchases.restorePurchases();
      const pro = !!info?.entitlements?.active?.[ENTITLEMENT_ID];
      setIsPro(pro);
      return pro;
    } catch (e) {
      console.log("RC restore error:", e?.message);
      return false;
    }
  }, []);

  return (
    <ProContext.Provider value={{ isPro, loading, offerings, purchase, restore, refresh }}>
      {children}
    </ProContext.Provider>
  );
}

export function usePro() {
  return useContext(ProContext);
}
