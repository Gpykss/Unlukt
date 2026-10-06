// src/services/mediaService.js
// Locked posts and PPV messages only carry a blurred preview publicly. People with access get the
// real media from the server (`getMedia`), which checks the unlock / subscription first.
import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

const cache = new Map(); // key -> { at, value | promise }
const TTL = 50 * 60 * 1000; // signed links last 1h

const cached = (key, load) => {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const value = load().catch((e) => { cache.delete(key); throw e; });
  cache.set(key, { at: Date.now(), value });
  return value;
};

const getMediaFn = () => httpsCallable(functions, 'getMedia', { timeout: 20000 });

/** Real media items for a post the viewer can see: [{ url, type, width, height }] */
export const getPostMedia = (postId) =>
  cached(`post:${postId}`, async () => (await getMediaFn()({ postId })).data?.items || []);

/** Real media for a PPV message the viewer sent or unlocked: { url, mediaType } */
export const getMessageMedia = (conversationId, messageId) =>
  cached(`msg:${messageId}`, async () => (await getMediaFn()({ conversationId, messageId })).data || {});

/** Forget cached access (e.g. right after an unlock). */
export const clearMediaCache = (id) => { cache.delete(`post:${id}`); cache.delete(`msg:${id}`); };

/** Does this post have protected (server-held) media? */
export const hasLockedMedia = (post) => (post?.images || []).some((i) => i && i.locked);
