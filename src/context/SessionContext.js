import React, { createContext, useContext, useEffect, useState } from 'react';
import { getSessions, saveSessions } from '../services/storage';

const SessionContext = createContext();

export function SessionProvider({ children }) {
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    (async () => {
      const stored = await getSessions();
      if (stored) setSessions(stored);
    })();
  }, []);

  useEffect(() => {
    saveSessions(sessions);
  }, [sessions]);

  const addSession = (session) => {
    setSessions((prev) => [...prev, { id: Date.now().toString(), ...session }]);
  };

  return (
    <SessionContext.Provider value={{ sessions, addSession }}>
      {children}
    </SessionContext.Provider>
  );
}

export const useSessions = () => useContext(SessionContext);
