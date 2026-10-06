// src/utils/notifySound.js
// Unlukt's own notification sound, generated with Web Audio (no file to host or load).
// Browsers only allow sound after the user has interacted with the page once, so we unlock
// the audio context on the first tap/click/keypress.

let ctx = null;
let unlocked = false;

const getCtx = () => {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
};

const unlock = () => {
  const c = getCtx();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
  unlocked = true;
  ['pointerdown', 'keydown', 'touchstart'].forEach((e) => window.removeEventListener(e, unlock, true));
};
if (typeof window !== 'undefined') {
  ['pointerdown', 'keydown', 'touchstart'].forEach((e) => window.addEventListener(e, unlock, true));
}

const SOUND_KEY = 'unlukt_sound_on';
export const isSoundOn = () => {
  try { return localStorage.getItem(SOUND_KEY) !== '0'; } catch { return true; }
};
export const setSoundOn = (on) => {
  try { localStorage.setItem(SOUND_KEY, on ? '1' : '0'); } catch { /* private mode */ }
};

const tone = (c, freq, start, dur, gain = 0.18, type = 'sine') => {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g).connect(c.destination);
  osc.start(start);
  osc.stop(start + dur + 0.05);
};

/**
 * Play a notification sound.
 *  'default' — soft two-note "ding-dong" (bookings, general)
 *  'money'   — bright three-note rise (tips, purchases, paid requests)
 *  'request' — quick double pop (stage / guest requests, questions)
 */
export const playNotifySound = (kind = 'default') => {
  if (!isSoundOn() || !unlocked) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  const t = c.currentTime + 0.01;
  if (kind === 'money') {
    tone(c, 784, t, 0.18);        // G5
    tone(c, 988, t + 0.09, 0.18); // B5
    tone(c, 1319, t + 0.18, 0.35, 0.16); // E6
  } else if (kind === 'request') {
    tone(c, 880, t, 0.12, 0.16, 'triangle');
    tone(c, 1175, t + 0.13, 0.2, 0.16, 'triangle');
  } else {
    tone(c, 1047, t, 0.25);       // C6
    tone(c, 784, t + 0.16, 0.4);  // G5
  }
};

/** Pick a sound for a notification document type. */
export const soundForType = (type = '') => {
  if (/tip|payment|purchase|unlock|earning|subscri|payout|withdraw/i.test(type)) return 'money';
  if (/request|question|stage|cohost|guest/i.test(type)) return 'request';
  return 'default';
};
