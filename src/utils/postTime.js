// src/utils/postTime.js
//
// One place to read a post's real creation time.
// Older posts were saved with a broken createdAt (an empty map instead of a Timestamp), which made
// every post say "Just now". When createdAt is broken we recover the time from the media upload
// path — uploads are stored as `uploads/<uid>/<Date.now()>_<file>` — and heal the doc.

import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db, auth } from '../config/firebase';

export const toDate = (ts) => {
  if (!ts) return null;
  try {
    if (typeof ts.toDate === 'function') return ts.toDate();
    if (ts instanceof Date) return isNaN(ts.getTime()) ? null : ts;
    if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
    if (typeof ts._seconds === 'number') return new Date(ts._seconds * 1000);
    if (typeof ts === 'number') return new Date(ts < 1e11 ? ts * 1000 : ts);
    if (typeof ts === 'string') {
      const d = new Date(ts);
      return isNaN(d.getTime()) ? null : d;
    }
  } catch { /* fall through */ }
  return null;
};

const MIN_MS = Date.UTC(2025, 0, 1);

/** Upload time embedded in a media URL (…/1791230000000_name.jpg), or null. */
const dateFromMedia = (post) => {
  const urls = [];
  (post?.images || []).forEach((m) => urls.push(typeof m === 'string' ? m : m?.url));
  urls.push(post?.mediaUrl, post?.videoUrl, post?.imageUrl, post?.thumbnail);
  for (const u of urls) {
    if (typeof u !== 'string') continue;
    // Bunny: …/uploads/<uid>/<ms>_file   ·   Cloudinary: …/upload/v<seconds>/file
    const bunny = u.match(/[/_](\d{13})_/);
    const cloud = u.match(/\/v(\d{10})\//);
    const ms = bunny ? Number(bunny[1]) : cloud ? Number(cloud[1]) * 1000 : 0;
    if (ms > MIN_MS && ms < Date.now() + 60_000) return new Date(ms);
  }
  return null;
};

/** The post's creation Date, or null when it truly can't be known. */
export const getPostDate = (post) => toDate(post?.createdAt) || dateFromMedia(post);

export const getPostMillis = (post) => getPostDate(post)?.getTime() || 0;

/** "5m ago • 3:12 PM", "Yesterday • 9:01 AM", "Oct 2 • 4:40 PM" — never a fake "Just now". */
export const formatPostTime = (post) => {
  const date = getPostDate(post);
  if (!date) return 'Earlier';
  const now = new Date();
  const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const diff = Math.max(0, now - date);
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (now.toDateString() === date.toDateString()) {
    if (minutes < 1) return `Just now • ${timeStr}`;
    if (minutes < 60) return `${minutes}m ago • ${timeStr}`;
    return `${hours}h ago • ${timeStr}`;
  }
  if (yesterday.toDateString() === date.toDateString()) return `Yesterday • ${timeStr}`;
  const sameYear = now.getFullYear() === date.getFullYear();
  const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
  return `${dateStr} • ${timeStr}`;
};

/** Short relative form for modals/notifications: "5m ago", "3h ago", "2d ago", "Oct 2". */
export const timeAgo = (postOrTs) => {
  const date = postOrTs && (postOrTs.createdAt !== undefined || postOrTs.images)
    ? getPostDate(postOrTs)
    : toDate(postOrTs);
  if (!date) return 'Earlier';
  const diff = Math.max(0, Date.now() - date.getTime());
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const healed = new Set();
/**
 * If a post's saved createdAt is broken but we recovered the real time, write it back once
 * (so feed ordering in Firestore becomes correct too). Fire-and-forget; needs a signed-in user.
 */
export const healPostDates = (posts) => {
  if (!auth.currentUser) return;
  posts.forEach((p) => {
    if (!p?.id || healed.has(p.id) || toDate(p.createdAt)) return;
    const recovered = dateFromMedia(p);
    if (!recovered) return;
    healed.add(p.id);
    const ts = Timestamp.fromDate(recovered);
    updateDoc(doc(db, 'posts', p.id), {
      createdAt: ts,
      ...(toDate(p.updatedAt) ? {} : { updatedAt: ts }),
    }).catch(() => healed.delete(p.id));
  });
};
