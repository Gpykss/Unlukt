// functions/src/media.js
//
// Paid media protection.
// Posts that aren't free, and PPV messages, must never carry the real media URL in a document
// everyone can read. A Firestore trigger moves the originals into mediaPrivate/* (no client can
// read it) and leaves only a tiny blurred preview (a ~1 KB data: URL) in the public doc.
// Viewers who have access ask `getMedia`, which checks access and returns the real URLs
// New paid uploads live under /private/ on the CDN. Bunny only serves that folder with a signed,
// expiring link (Edge Rule "Enable Token Authentication" on */private/*), and the links are signed
// here with BUNNY_TOKEN_KEY — so a buyer can't pass on a link that works forever.

const admin = require("firebase-admin");
const { HttpsError } = require("firebase-functions/v2/https");
const { signBunnyUrl } = require("./bunny");

const isVideoItem = (i) => i?.type === "video" || /\.(mp4|mov|avi|webm|mkv|m4v|3gp)(\?|$)/i.test(i?.url || "");

/** Tiny blurred preview (data: URL) for an image URL; null for videos or on any failure. */
async function blurPreview(url) {
  try {
    const res = await fetch(signed(url, 300), { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const sharp = require("sharp");
    const out = await sharp(buf).rotate().resize(48, 48, { fit: "inside" }).blur(4).webp({ quality: 40 }).toBuffer();
    return `data:image/webp;base64,${out.toString("base64")}`;
  } catch (e) {
    console.warn("preview failed", e.message);
    return null;
  }
}

/**
 * Keep a post's media protected (called from the posts/{id} trigger).
 * - not free → originals to mediaPrivate/post_{id}; public images[] = { type, locked, i, previewUrl }
 * - free again → originals restored into images[]
 */
async function protectPost(postId, after) {
  const db = admin.firestore();
  const privRef = db.doc(`mediaPrivate/post_${postId}`);
  if (!after) { await privRef.delete().catch(() => {}); return "deleted"; }
  const images = Array.isArray(after.images) ? after.images : [];
  const locked = (after.type || "free") !== "free";
  // Cheap exits first: this trigger also fires on every like/comment count change
  if (locked && !images.some((i) => i && i.url)) return "already";
  if (!locked && !images.some((i) => i && i.locked)) return "free";
  const privSnap = await privRef.get();
  const saved = privSnap.exists ? (privSnap.get("items") || []) : [];

  // Current originals, in order: an item with a url is new/original; a locked item points at saved[i]
  const originals = images.map((it) => (it && it.url ? { ...it, url: bare(it.url) } : (it && it.locked && saved[it.i]) || null)).filter(Boolean);

  if (!locked) {
    if (!images.some((i) => i && i.locked)) return "free";
    // Now free for everyone: files in the protected folder get a long-lived link in the public post
    await db.doc(`posts/${postId}`).update({ images: originals.map((o) => ({ ...o, url: signed(o.url, FREE_TTL) })) });
    return "restored";
  }
  if (!images.some((i) => i && i.url)) return "already";

  const pub = [];
  for (let i = 0; i < originals.length; i += 1) {
    const o = originals[i];
    const video = isVideoItem(o);
    pub.push({
      type: video ? "video" : "image", locked: true, i,
      width: o.width || 0, height: o.height || 0, duration: o.duration || null,
      previewUrl: video ? (o.thumbnailUrl ? await blurPreview(o.thumbnailUrl) : null) : await blurPreview(o.url),
    });
  }
  await privRef.set({ postId, ownerId: after.userId, items: originals, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  await db.doc(`posts/${postId}`).update({ images: pub, mediaProtected: true });
  return "protected";
}

/** PPV message: move mediaUrl to mediaPrivate/{messageId} (the `unlock` ledger already reads bunnyPath there). */
async function protectMessage(conversationId, messageId, data) {
  if (!data || !data.isPPV || (!data.mediaUrl && !data.content)) return "skip";
  const db = admin.firestore();
  const video = data.mediaType === "video" || isVideoItem({ url: data.mediaUrl });
  await db.doc(`mediaPrivate/${messageId}`).set({
    conversationId, messageId, senderId: data.senderId || null, bunnyPath: data.mediaUrl || null, mediaType: data.mediaType || null,
    content: data.content || "",
    // price snapshot: what the fan saw is what they pay, even if the message is edited later
    priceMinor: Math.round(Number(data.unlockPrice ?? data.price ?? 0) * 100) || null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await db.doc(`conversations/${conversationId}/messages/${messageId}`).update({
    mediaUrl: admin.firestore.FieldValue.delete(),
    hasMedia: !!data.mediaUrl,
    // the locked text: only a short teaser stays public (same as the old preview)
    content: data.content ? `${String(data.content).slice(0, 20)}…` : "",
    mediaProtected: true,
    previewUrl: !data.mediaUrl || video ? null : await blurPreview(data.mediaUrl),
  });
  return "protected";
}

// Files under this CDN folder need a signed link (see uploadToBunny + the Bunny Edge Rule).
const PRIVATE_PREFIX = "/private/";
const FREE_TTL = 10 * 365 * 24 * 3600; // a paid post turned free: its link may live "forever"

const isPrivateUrl = (url) => {
  try { return new URL(url).pathname.startsWith(PRIVATE_PREFIX); } catch { return false; }
};

/** A protected file's URL without any old token on it (what we keep in mediaPrivate). */
function bare(url) {
  if (!isPrivateUrl(url)) return url;
  const u = new URL(url);
  return `${u.protocol}//${u.host}${u.pathname}`;
}

/** Signed, expiring link for a protected file. Anything else is returned unchanged. */
function signed(url, ttlSeconds = 3600) {
  const key = (process.env.BUNNY_TOKEN_KEY || "").trim();
  if (!key || !url || !isPrivateUrl(url)) return url;
  try {
    const u = new URL(url);
    return signBunnyUrl({ host: `${u.protocol}//${u.host}`, path: u.pathname, securityKey: key, ttlSeconds });
  } catch { return url; }
}

const toMillis = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : v ? new Date(v).getTime() : null);

/** Real media for someone allowed to see it. data: { postId } or { conversationId, messageId } */
async function getMedia(uid, data) {
  const db = admin.firestore();
  if (data.postId) {
    const postId = String(data.postId);
    const post = await db.doc(`posts/${postId}`).get();
    if (!post.exists) throw new HttpsError("not-found", "Post not found");
    const p = post.data();
    const type = p.type || "free";
    let ok = type === "free" || p.userId === uid;
    if (!ok && uid) {
      const [sub, unlock, legacy, me] = await Promise.all([
        db.doc(`subscriptions/${uid}_${p.userId}`).get(),
        db.doc(`unlocks/${postId}_${uid}`).get(),
        db.doc(`unlocked_content/${uid}_${postId}`).get(),
        db.doc(`users/${uid}`).get(),
      ]);
      const s = sub.exists ? sub.data() : null;
      const subActive = s && s.status === "active" && (!toMillis(s.expiresAt) || toMillis(s.expiresAt) > Date.now());
      // Same rule as the app: an active subscription opens every non-free post; paid posts can also be bought
      ok = !!subActive || (type === "paid" && (unlock.exists || legacy.exists)) || me.get("isAdmin") === true;
    }
    if (!ok) throw new HttpsError("permission-denied", "Unlock or subscribe to see this");
    const priv = await db.doc(`mediaPrivate/post_${postId}`).get();
    const items = priv.exists ? priv.get("items") || [] : (p.images || []).filter((i) => i.url);
    return { items: items.map((i) => ({ ...i, url: signed(i.url), ...(i.thumbnailUrl ? { thumbnailUrl: signed(i.thumbnailUrl) } : {}) })) };
  }
  const { conversationId, messageId } = data;
  if (!conversationId || !messageId) throw new HttpsError("invalid-argument", "Missing media id");
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required");
  const conv = await db.doc(`conversations/${conversationId}`).get();
  if (!conv.exists || !(conv.get("participants") || []).includes(uid)) throw new HttpsError("permission-denied", "Not your conversation");
  const msg = await db.doc(`conversations/${conversationId}/messages/${messageId}`).get();
  if (!msg.exists) throw new HttpsError("not-found", "Message not found");
  const m = msg.data();
  const ok = m.senderId === uid || (Array.isArray(m.unlockedBy) && m.unlockedBy.includes(uid)) || !m.isPPV;
  if (!ok) throw new HttpsError("permission-denied", "Unlock this message to see it");
  const priv = await db.doc(`mediaPrivate/${messageId}`).get();
  const url = priv.exists ? priv.get("bunnyPath") : m.mediaUrl;
  return {
    url: url ? signed(url) : null,
    mediaType: m.mediaType || (priv.exists ? priv.get("mediaType") : null),
    content: priv.exists ? priv.get("content") || "" : m.content || "",
  };
}

const cleanItem = (i) => ({
  url: bare(String(i.url)), type: isVideoItem(i) ? "video" : "image",
  publicId: String(i.publicId || "").slice(0, 200), width: Number(i.width) || 0, height: Number(i.height) || 0,
  duration: i.duration != null ? Number(i.duration) || null : null,
  ...(i.thumbnailUrl ? { thumbnailUrl: String(i.thumbnailUrl) } : {}),
});
const okUrl = (u) => typeof u === "string" && /^https:\/\//.test(u) && u.length < 2000;

/**
 * Create a locked (subscribers / paid) post: originals go to mediaPrivate FIRST, then the public
 * post with blurred previews — so the real URL is never in a public doc, not even for a second.
 */
async function publishPost(uid, data) {
  const db = admin.firestore();
  const p = data.post || {};
  const type = ["subscribers", "paid"].includes(p.type) ? p.type : null;
  if (!type) throw new HttpsError("invalid-argument", "Use a normal post for free content");
  const price = type === "paid" ? Math.round(Number(p.price) * 100) / 100 : 0;
  if (type === "paid" && !(price >= 1 && price <= 10000)) throw new HttpsError("invalid-argument", "Price must be between $1 and $10,000");
  const originals = (Array.isArray(p.images) ? p.images : []).filter((i) => i && okUrl(i.url)).slice(0, 20).map(cleanItem);
  const ref = db.collection("posts").doc();
  const pub = [];
  for (let i = 0; i < originals.length; i += 1) {
    const o = originals[i];
    const video = o.type === "video";
    pub.push({
      type: o.type, locked: true, i, width: o.width, height: o.height, duration: o.duration,
      previewUrl: video ? (o.thumbnailUrl ? await blurPreview(o.thumbnailUrl) : null) : await blurPreview(o.url),
    });
  }
  const FV = admin.firestore.FieldValue;
  await db.doc(`mediaPrivate/post_${ref.id}`).set({ postId: ref.id, ownerId: uid, items: originals, updatedAt: FV.serverTimestamp() });
  await ref.set({
    id: ref.id, userId: uid, content: String(p.content || "").slice(0, 5000), images: pub, type, price,
    contentRating: ["sfw", "nsfw"].includes(String(p.contentRating || "").toLowerCase()) ? String(p.contentRating).toLowerCase() : "sfw",
    tags: (Array.isArray(p.tags) ? p.tags : []).map((t) => String(t).slice(0, 40)).filter(Boolean).slice(0, 20),
    likes: 0, comments: 0, shares: 0, likedBy: [], pinned: !!p.pinned, archived: false, mediaProtected: true,
    createdAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp(),
  });
  return { id: ref.id, images: pub };
}

/** Send a PPV message: media + text stored privately first, the chat only gets a teaser. */
async function sendPPV(uid, data) {
  const db = admin.firestore();
  const conversationId = String(data.conversationId || "");
  const conv = await db.doc(`conversations/${conversationId}`).get();
  if (!conv.exists || !(conv.get("participants") || []).includes(uid)) throw new HttpsError("permission-denied", "Not your conversation");
  const unlockPrice = Math.max(1, Math.min(10000, Math.round(Number(data.price || 5) * 100) / 100));
  const content = String(data.content || "").slice(0, 5000);
  const mediaUrl = okUrl(data.mediaUrl) ? bare(data.mediaUrl) : null;
  const mediaType = mediaUrl ? (data.mediaType === "video" ? "video" : "image") : null;
  const FV = admin.firestore.FieldValue;
  const msgRef = db.collection(`conversations/${conversationId}/messages`).doc();
  await db.doc(`mediaPrivate/${msgRef.id}`).set({
    conversationId, messageId: msgRef.id, senderId: uid, bunnyPath: mediaUrl, mediaType, content,
    priceMinor: Math.round(unlockPrice * 100), updatedAt: FV.serverTimestamp(),
  });
  await msgRef.set({
    senderId: uid, isPPV: true, unlockPrice, unlockedBy: [], mediaType, hasMedia: !!mediaUrl,
    content: content ? `${content.slice(0, 20)}…` : "", mediaProtected: true,
    previewUrl: mediaUrl && mediaType === "image" ? await blurPreview(mediaUrl) : null,
    createdAt: FV.serverTimestamp(),
  });
  await db.doc(`conversations/${conversationId}`).set({
    lastMessage: "🔒 Locked message", lastMessageTime: FV.serverTimestamp(), updatedAt: FV.serverTimestamp(),
  }, { merge: true });
  return { messageId: msgRef.id, unlockPrice };
}

module.exports = { protectPost, protectMessage, getMedia, publishPost, sendPPV, blurPreview, isVideoItem, signedUrl: signed, isPrivateUrl, PRIVATE_PREFIX };
