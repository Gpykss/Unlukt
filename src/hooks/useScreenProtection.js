// src/hooks/useScreenProtection.js - React Hook for Anti-Piracy

import { useEffect } from 'react';
import { useAuth } from './useAuth';
import { initializeAntiPiracy } from '../utils/antiPiracy';
import logger from '../utils/logger';

/**
 * Hook to enable anti-piracy protection on a page/component
 * @param {Array} elementRefs - Array of React refs to protected elements
 * @param {Object} options - Configuration options
 */
export const useScreenProtection = (elementRefs = [], options = {}) => {
  const { currentUser, userProfile } = useAuth();
  
  useEffect(() => {
    if (!currentUser || !userProfile) return;
    
    const elements = elementRefs
      .map(ref => ref?.current)
      .filter(Boolean);
    
    const cleanup = initializeAntiPiracy({
      userId: currentUser.uid,
      userEmail: userProfile.email || currentUser.email,
      protectedElements: elements,
      onRecordingDetected: () => {
        logger.error('Screen recording detected - content blocked');
        if (options.onRecordingDetected) {
          options.onRecordingDetected();
        }
      },
      onDevToolsDetected: () => {
        logger.warn('DevTools detected');
        if (options.onDevToolsDetected) {
          options.onDevToolsDetected();
        }
      }
    });
    
    return cleanup;
  }, [currentUser, userProfile, elementRefs, options]);
};

export default useScreenProtection;
