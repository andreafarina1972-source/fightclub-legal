// src/i18n/LanguageContext.js
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { initLanguage, setLanguage, getLanguage, i18n } from "./index";

const LanguageContext = createContext({
  lang: "en",
  ready: false,
  setLang: async (_code) => "en",
});

export function LanguageProvider({ children }) {
  // stato iniziale coerente con i18n
  const [lang, setLangState] = useState(() => getLanguage?.() || i18n?.locale || "en");
  const [ready, setReady] = useState(false);

  // ✅ forza re-render globale anche dove t() è importato direttamente
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const l = await initLanguage(); // carica override o lingua device
        if (!alive) return;
        setLangState(l);
      } catch (e) {
        console.log("initLanguage error:", e);
      } finally {
        if (alive) setReady(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const setLang = async (code) => {
    try {
      const l = await setLanguage(code); // salva + setta i18n.locale (+ RTL se serve)
      setLangState(l);                   // trigger re-render globale
      setRefreshKey((k) => k + 1);       // ✅ forza refresh UI
      return l;
    } catch (e) {
      console.log("setLanguage error:", e);
      // fallback: mantieni la lingua corrente (o quella di i18n)
      return getLanguage?.() || i18n?.locale || lang;
    }
  };

  const value = useMemo(() => ({ lang, ready, setLang }), [lang, ready, setLang]);

  // ✅ wrapper key per re-render affidabile di tutto l'albero
  return (
    <LanguageContext.Provider value={value}>
      <React.Fragment key={refreshKey}>{children}</React.Fragment>
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
