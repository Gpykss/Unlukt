// src/utils/antiPiracy.js - Anti-Piracy Protection Utilities

import logger from './logger';

// Every function returns a cleanup, and global hooks are installed ONCE.
// (Previously each call stacked new listeners/intervals and re-wrapped getUserMedia; the call
//  pages re-ran it on every render, so after a few minutes there were hundreds of timers and a
//  getUserMedia wrapped hundreds of times deep — enough to freeze Chrome and break the camera.)

/**
 * Block screenshot detection
 */
export const blockScreenshots = () => {
  const onKeyUp = (e) => {
    if (e.key === 'PrintScreen') {
      navigator.clipboard?.writeText('').catch(() => {});
      logger.warn('Screenshot attempt detected and blocked');
    }
  };
  // Mac Cmd+Shift+3/4, Windows Snipping Tool shortcut
  const onKeyDown = (e) => {
    if (
      (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4')) ||
      (e.key === 's' && e.shiftKey && (e.metaKey || e.ctrlKey))
    ) {
      e.preventDefault();
      logger.warn('Screenshot shortcut blocked');
    }
  };
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('keydown', onKeyDown);
  return () => {
    document.removeEventListener('keyup', onKeyUp);
    document.removeEventListener('keydown', onKeyDown);
  };
};

// ── Screen-recording detection: wrap the media APIs exactly once, fan out to subscribers ──
const recordingSubscribers = new Set();
let mediaHooksInstalled = false;

const installMediaHooks = () => {
  if (mediaHooksInstalled || !navigator.mediaDevices) return;
  mediaHooksInstalled = true;
  const md = navigator.mediaDevices;

  if (md.getDisplayMedia) {
    md.getDisplayMedia = async function () {
      logger.error('Screen recording detected!');
      recordingSubscribers.forEach((fn) => fn());
      throw new Error('Screen recording is not allowed');
    };
  }

  const originalGetUserMedia = md.getUserMedia?.bind(md); // bound → works however it's called
  if (originalGetUserMedia) {
    md.getUserMedia = async function (constraints) {
      const v = constraints?.video;
      if (v && typeof v === 'object' && (v.displaySurface || v.logicalSurface)) {
        logger.error('Screen recording detected via getUserMedia');
        recordingSubscribers.forEach((fn) => fn());
        throw new Error('Screen recording is not allowed');
      }
      return originalGetUserMedia(constraints);
    };
  }
};

/**
 * Detect screen recording software
 */
export const detectScreenRecording = (onDetected) => {
  installMediaHooks();
  if (onDetected) recordingSubscribers.add(onDetected);
  return () => { if (onDetected) recordingSubscribers.delete(onDetected); };
};

/**
 * Disable right-click context menu
 */
export const disableRightClick = (element) => {
  const handler = (e) => { e.preventDefault(); return false; };
  element.addEventListener('contextmenu', handler);
  return () => element.removeEventListener('contextmenu', handler);
};

/**
 * Disable drag and drop (prevents saving images)
 */
export const disableDragDrop = (element) => {
  const handler = (e) => { e.preventDefault(); return false; };
  element.addEventListener('dragstart', handler);
  return () => element.removeEventListener('dragstart', handler);
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
  const id = setInterval(() => {
    if (
      window.outerWidth - window.innerWidth > threshold ||
      window.outerHeight - window.innerHeight > threshold
    ) {
      if (onDetected) onDetected();
    }
  }, 2000);
  return () => clearInterval(id);
};

/**
 * Blur protected content while the TAB is hidden (switched away / minimised).
 * Not on window blur — clicking another window (e.g. a second call window on the same
 * computer) shouldn't blur a call you're still watching.
 */
export const blurOnBlur = (elements) => {
  const apply = () => {
    const hidden = document.visibilityState === 'hidden';
    elements.forEach((el) => { if (el) el.style.filter = hidden ? 'blur(20px)' : ''; });
  };
  document.addEventListener('visibilitychange', apply);
  return () => {
    document.removeEventListener('visibilitychange', apply);
    elements.forEach((el) => { if (el) el.style.filter = ''; });
  };
};

/**
 * Initialize all anti-piracy measures. Returns ONE cleanup that removes everything it added.
 */
export const initializeAntiPiracy = (options = {}) => {
  const { protectedElements = [], onRecordingDetected, onDevToolsDetected } = options;
  const cleanups = [];

  cleanups.push(blockScreenshots());
  cleanups.push(detectScreenRecording(onRecordingDetected));
  if (onDevToolsDetected) cleanups.push(detectDevTools(onDevToolsDetected));

  protectedElements.forEach((element) => {
    if (element) {
      cleanups.push(disableRightClick(element));
      cleanups.push(disableDragDrop(element));
    }
  });
  if (protectedElements.length > 0) cleanups.push(blurOnBlur(protectedElements));

  return () => cleanups.forEach((fn) => { try { fn?.(); } catch { /* ignore */ } });
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
