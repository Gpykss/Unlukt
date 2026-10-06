// src/hooks/useScreenProtection.js - React Hook for Anti-Piracy

import { useEffect, useRef } from 'react';
import { useAuth } from './useAuth';
import { initializeAntiPiracy } from '../utils/antiPiracy';

/**
 * Enable anti-piracy protection on a page/component.
 * Sets up ONCE per signed-in user (not on every render) and fully cleans up on unmount.
 * @param {Array} elementRefs - Array of React refs to protected elements
 * @param {Object} options - { onRecordingDetected, onDevToolsDetected }
 */
export const useScreenProtection = (elementRefs = [], options = {}) => {
  const { currentUser } = useAuth();
  const optionsRef = useRef(options);
  const refsRef = useRef(elementRefs);
  useEffect(() => {
    optionsRef.current = options;
    refsRef.current = elementRefs;
  });

  useEffect(() => {
    if (!currentUser?.uid) return;
    const elements = refsRef.current.map((ref) => ref?.current).filter(Boolean);
    return initializeAntiPiracy({
      protectedElements: elements,
      onRecordingDetected: () => optionsRef.current.onRecordingDetected?.(),
      onDevToolsDetected: optionsRef.current.onDevToolsDetected
        ? () => optionsRef.current.onDevToolsDetected?.()
        : undefined,
    });
  }, [currentUser?.uid]);
};

export default useScreenProtection;
