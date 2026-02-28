import { createContext, useEffect, useMemo, useState } from 'react';

export const ContentSettingsContext = createContext(null);

export function ContentSettingsProvider({ children }) {
  const [showNSFW, setShowNSFW] = useState(() => {
    try {
      const saved = localStorage.getItem('showNSFW');
      if (saved === null) return false; // default OFF
      return saved === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('showNSFW', String(showNSFW));
    } catch {
      // ignore
    }
  }, [showNSFW]);

  const value = useMemo(
    () => ({ showNSFW, setShowNSFW }),
    [showNSFW]
  );

  return (
    <ContentSettingsContext.Provider value={value}>
      {children}
    </ContentSettingsContext.Provider>
  );
}
