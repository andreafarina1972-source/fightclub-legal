// src/context/RpePromptContext.js
//
// sRPE (BRIEF-srpe.md, Fase 3) — permette a qualunque schermata (oggi solo
// HistoryScreen.js) di aprire RpePromptModal per una sessione specifica,
// per aggiungere o correggere l'RPE a posteriori, riusando la stessa UI
// della raccolta automatica invece di costruirne una seconda.
//
// Stato minimo: solo l'id della sessione richiesta esplicitamente.
// RpePromptModal gli dà priorità sui propri percorsi automatici (notifica/
// scansione in-app) e, a differenza di quelli, non applica i filtri
// rpe==null/finestra 24h — un'apertura manuale è sempre un'azione
// esplicita dell'atleta, che sia per aggiungere o per correggere.

import React, { createContext, useCallback, useContext, useState } from "react";

const RpePromptContext = createContext({
  requestedId: null,
  requestRpePrompt: () => {},
  clearRpePromptRequest: () => {},
});

export function RpePromptProvider({ children }) {
  const [requestedId, setRequestedId] = useState(null);

  const requestRpePrompt = useCallback((sessionId) => {
    const id = sessionId?.toString?.();
    if (id) setRequestedId(id);
  }, []);

  const clearRpePromptRequest = useCallback(() => setRequestedId(null), []);

  return (
    <RpePromptContext.Provider value={{ requestedId, requestRpePrompt, clearRpePromptRequest }}>
      {children}
    </RpePromptContext.Provider>
  );
}

export function useRpePrompt() {
  return useContext(RpePromptContext);
}
