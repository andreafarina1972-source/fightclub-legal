import React, { createContext, useContext, useState } from 'react';

const PunchContext = createContext();

export function PunchProvider({ children }) {
  const [punchCount, setPunchCount] = useState(0);

  const resetPunches = () => setPunchCount(0);
  const incrementPunches = (n = 1) =>
    setPunchCount((prev) => prev + n);

  return (
    <PunchContext.Provider
      value={{ punchCount, setPunchCount, resetPunches, incrementPunches }}
    >
      {children}
    </PunchContext.Provider>
  );
}

export const usePunches = () => useContext(PunchContext);
