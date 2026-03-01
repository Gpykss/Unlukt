// src/utils/antiPiracy.js - Anti-Piracy Protection Utilities

import logger from './logger';

/**
 * Block screenshot detection
 */
export const blockScreenshots = () => {
  // Detect PrintScreen key
  document.addEventListener('keyup', (e) => {
    if (e.key === 'PrintScreen') {
      navigator.clipboard.writeText('');
      logger.warn('Screenshot attempt detected and blocked');
    }
  });
  
  // Detect keyboard shortcuts (Cmd+Shift+3/4 on Mac, Win+Shift+S on Windows)
  document.addEventListener('keydown', (e) => {
    if (
      (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4')) || // Mac
      (e.key === 's' && e.shiftKey && (e.metaKey || e.ctrlKey)) // Windows Snipping Tool
    ) {
      e.preventDefault();
      logger.warn('Screenshot shortcut blocked');
    }
  });
};

/**
 * Detect screen recording software
 */
export const detectScreenRecording = (onDetected) => {
  // Check if user is using screen capture API
  if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
    const originalGetDisplayMedia = navigator.mediaDevices.getDisplayMedia;
    
    navigator.mediaDevices.getDisplayMedia = async function(...args) {
      logger.error('Screen recording detected!');
      if (onDetected) {
        onDetected();
      }
      throw new Error('Screen recording is not allowed');
    };
  }
  
  // Detect OBS/Streamlabs via getUserMedia
  const originalGetUserMedia = navigator.mediaDevices?.getUserMedia;
  if (originalGetUserMedia) {
    navigator.mediaDevices.getUserMedia = async function(constraints) {
      if (constraints?.video && typeof constraints.video === 'object') {
        if (constraints.video.displaySurface || constraints.video.logicalSurface) {
          logger.error('Screen recording detected via getUserMedia');
          if (onDetected) onDetected();
          throw new Error('Screen recording is not allowed');
        }
      }
      return originalGetUserMedia.call(this, constraints);
    };
  }
};

/**
 * Disable right-click context menu
 */
export const disableRightClick = (element) => {
  element.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    logger.debug('Right-click blocked');
    return false;
  });
};

/**
 * Disable drag and drop (prevents saving images)
 */
export const disableDragDrop = (element) => {
  element.addEventListener('dragstart', (e) => {
    e.preventDefault();
    logger.debug('Drag blocked');
    return false;
  });
};

/**
 * Generate dynamic watermark text
 */
export const generateWatermarkText = (userId, userEmail) => {
  const id = userId.substring(0, 8);
  const email = userEmail.split('@')[0];
  return `${email}-${id}`;
};

/**
 * Get random watermark position (changes every few seconds)
 */
export const getRandomWatermarkPosition = () => {
  const positions = [
    { top: '10%', left: '10%' },
    { top: '10%', right: '10%' },
    { bottom: '10%', left: '10%' },
    { bottom: '10%', right: '10%' },
    { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  ];
  
  return positions[Math.floor(Math.random() * positions.length)];
};

/**
 * Detect DevTools open (basic check)
 */
export const detectDevTools = (onDetected) => {
  const threshold = 160;
  
  setInterval(() => {
    if (
      window.outerWidth - window.innerWidth > threshold ||
      window.outerHeight - window.innerHeight > threshold
    ) {
      logger.warn('DevTools might be open');
      if (onDetected) onDetected();
    }
  }, 1000);
};

/**
 * Blur content when window loses focus (prevents recording in background)
 */
export const blurOnBlur = (elements) => {
  const handleBlur = () => {
    elements.forEach(el => {
      if (el) el.style.filter = 'blur(20px)';
    });
    logger.debug('Content blurred (window not focused)');
  };
  
  const handleFocus = () => {
    elements.forEach(el => {
      if (el) el.style.filter = 'none';
    });
    logger.debug('Content unblurred');
  };
  
  window.addEventListener('blur', handleBlur);
  window.addEventListener('focus', handleFocus);
  
  return () => {
    window.removeEventListener('blur', handleBlur);
    window.removeEventListener('focus', handleFocus);
  };
};

/**
 * Initialize all anti-piracy measures
 */
export const initializeAntiPiracy = (options = {}) => {
  const {
    userId,
    userEmail,
    protectedElements = [],
    onRecordingDetected,
    onDevToolsDetected
  } = options;
  
  // Block screenshots
  blockScreenshots();
  
  // Detect screen recording
  detectScreenRecording(onRecordingDetected);
  
  // Detect DevTools
  if (onDevToolsDetected) {
    detectDevTools(onDevToolsDetected);
  }
  
  // Protect all specified elements
  protectedElements.forEach(element => {
    if (element) {
      disableRightClick(element);
      disableDragDrop(element);
    }
  });
  
  // Blur on window blur
  if (protectedElements.length > 0) {
    blurOnBlur(protectedElements);
  }
  
  logger.success('Anti-piracy protection initialized');
};

export default {
  blockScreenshots,
  detectScreenRecording,
  disableRightClick,
  disableDragDrop,
  generateWatermarkText,
  getRandomWatermarkPosition,
  detectDevTools,
  blurOnBlur,
  initializeAntiPiracy
};
