import React, { createContext, useContext, useState } from 'react';

const HeartRateContext = createContext();

export function HeartRateProvider({ children }) {
  const [heartRate, setHeartRate] = useState(null);

  return (
    <HeartRateContext.Provider value={{ heartRate, setHeartRate }}>
      {children}
    </HeartRateContext.Provider>
  );
}

export const useHeartRate = () => useContext(HeartRateContext);
