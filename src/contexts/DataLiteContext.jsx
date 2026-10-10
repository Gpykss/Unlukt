// src/contexts/DataLiteContext.jsx
// Data Saver: when on, videos download only after the user taps play and feed images load smaller.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../hooks/useAuth';

const DataLiteContext = createContext({ dataLite: false, setDataLite: () => {} });

const readSaved = () => {
  try {
    const saved = localStorage.getItem('dataLite');
    if (saved === 'true' || saved === 'false') return saved === 'true';
  } catch { /* storage blocked */ }
  return null;
};
const writeSaved = (val) => {
  try { localStorage.setItem('dataLite', String(val)); } catch { /* storage blocked */ }
};
// The phone's own "Data Saver" / "Lite mode" setting (Android Chrome and others)
const deviceWantsLessData = () => {
  try { return navigator.connection?.saveData === true; } catch { return false; }
};

export function DataLiteProvider({ children }) {
  const { currentUser } = useAuth();
  // Saved choice wins; with no choice yet, follow the phone's data saver setting
  const [dataLite, setDataLiteState] = useState(() => readSaved() ?? deviceWantsLessData());

  // On login, pick up the choice saved on the account (only if one was ever saved there)
  useEffect(() => {
    if (!currentUser) return;
    let alive = true;
    getDoc(doc(db, 'users', currentUser.uid)).then((snap) => {
      const val = snap.exists() ? snap.data().dataLite : undefined;
      if (alive && typeof val === 'boolean') {
        setDataLiteState(val);
        writeSaved(val);
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, [currentUser]);

  const setDataLite = useCallback(async (val) => {
    const next = !!val;
    setDataLiteState(next);
    writeSaved(next);
    if (currentUser) {
      try {
        await updateDoc(doc(db, 'users', currentUser.uid), { dataLite: next });
      } catch (e) {
        console.error('Failed to save dataLite pref:', e);
      }
    }
  }, [currentUser]);

  const value = useMemo(() => ({ dataLite, setDataLite }), [dataLite, setDataLite]);

  return (
    <DataLiteContext.Provider value={value}>
      {children}
    </DataLiteContext.Provider>
  );
}

export const useDataLite = () => useContext(DataLiteContext);
