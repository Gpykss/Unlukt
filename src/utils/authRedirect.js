// src/utils/authRedirect.js
// Remembers where a logged-out visitor was heading (a creator profile, a live, a booking page)
// so that after sign-up / login / verify-email / complete-profile they land back there
// instead of the feed. Stored in localStorage (survives the verify-email tab) for 2 hours.

const KEY = 'unlukt_next';
const TTL_MS = 2 * 60 * 60 * 1000;

const isSafe = (p) => typeof p === 'string' && p.startsWith('/') && !p.startsWith('//')
  && !/^\/(login|register|verify-email|complete-profile)(\/|\?|$)/.test(p);

export const rememberNext = (path) => {
  if (!isSafe(path)) return;
  try { localStorage.setItem(KEY, JSON.stringify({ path, at: Date.now() })); } catch { /* ignore */ }
};

const readNext = () => {
  try {
    const qs = new URLSearchParams(window.location.search).get('next');
    if (isSafe(qs)) return qs;
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && isSafe(raw.path) && Date.now() - raw.at < TTL_MS) return raw.path;
  } catch { /* ignore */ }
  return null;
};

/** Where to go after auth completes. Clears the stored target. */
export const consumeNext = (fallback = '/feed') => {
  const p = readNext();
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  return p || fallback;
};

/** Build a /register (or /login) URL that returns to `path` afterwards. */
export const authUrl = (path, page = 'register') => {
  rememberNext(path);
  return isSafe(path) ? `/${page}?next=${encodeURIComponent(path)}` : `/${page}`;
};

/** Current path + query, for "come back here after signing up". */
export const herePath = () => window.location.pathname + window.location.search;

/** Capture ?ref=CODE from any URL so referral links can point at a profile. */
export const captureRef = (search = window.location.search) => {
  try {
    const ref = new URLSearchParams(search).get('ref');
    if (ref && /^[A-Za-z0-9_-]{2,40}$/.test(ref.trim())) {
      localStorage.setItem('unlukt_ref', ref.trim().toUpperCase());
    }
  } catch { /* ignore */ }
};
