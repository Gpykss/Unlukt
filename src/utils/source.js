// src/utils/source.js
// Traffic source tracking. Any link can carry ?src=NAME (example: unlukt.com/skyla?src=reddit).
// The name is kept in this browser until the visitor signs up, then saved on the new user as
// `signupSource` (see createUserProfile). Admin → Platform Analytics shows the numbers per source.

const KEY = 'unlukt_src';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // a link counts for 30 days

/** Lower-case letters, numbers, - _ . only, up to 40 characters. Anything else → null. */
export const cleanSource = (value) => {
  const s = String(value ?? '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_.-]{0,39}$/.test(s) ? s : null;
};

/** Remember ?src= from the current link. The most recent link wins. */
export const captureSource = (search = window.location.search) => {
  try {
    const src = cleanSource(new URLSearchParams(search).get('src'));
    if (src) localStorage.setItem(KEY, JSON.stringify({ src, at: Date.now() }));
  } catch { /* storage blocked — nothing to track */ }
};

/** The remembered source, or null. */
export const readSource = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    const src = raw && cleanSource(raw.src);
    if (src && Date.now() - Number(raw.at || 0) < TTL_MS) return src;
  } catch { /* ignore */ }
  return null;
};

export const clearSource = () => {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
};
