// src/contexts/DataLiteContext.jsx

import { createContext, useContext, useEffect, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../hooks/useAuth';

const DataLiteContext = createContext({ dataLite: false, setDataLite: () => {} });

export function DataLiteProvider({ children }) {
  const { currentUser } = useAuth();
  const [dataLite, setDataLiteState] = useState(() => {
    // Load from localStorage as fast fallback
    return localStorage.getItem('dataLite') === 'true';
  });

  // Sync from Firestore on login
  useEffect(() => {
    if (!currentUser) return;
    getDoc(doc(db, 'users', currentUser.uid)).then(snap => {
      if (snap.exists()) {
        const val = snap.data().dataLite ?? false;
        setDataLiteState(val);
        localStorage.setItem('dataLite', String(val));
      }
    }).catch(() => {});
  }, [currentUser]);

  const setDataLite = async (val) => {
    setDataLiteState(val);
    localStorage.setItem('dataLite', String(val));
    if (currentUser) {
      try {
        await updateDoc(doc(db, 'users', currentUser.uid), { dataLite: val });
      } catch (e) {
        console.error('Failed to save dataLite pref:', e);
      }
    }
  };

  return (
    <DataLiteContext.Provider value={{ dataLite, setDataLite }}>
      {children}
    </DataLiteContext.Provider>
  );
}

export const useDataLite = () => useContext(DataLiteContext);