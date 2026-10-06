// src/utils/adminContact.js
// Emails / phone numbers are private (user_private/{uid}, admins + owner only). Admin pages that
// list people merge them back in with this.
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';

let cache = null;
const loadAll = async () => {
  if (!cache) {
    cache = getDocs(collection(db, 'user_private'))
      .then((snap) => Object.fromEntries(snap.docs.map((d) => [d.id, d.data()])))
      .catch(() => ({}));
  }
  return cache;
};

/** Adds email / phoneNumber to each { id | uid } record (keeps any value already there). */
export const withContact = async (people) => {
  const all = await loadAll();
  return people.map((p) => {
    const c = all[p.id || p.uid] || {};
    return { ...p, email: p.email || c.email || '', phoneNumber: p.phoneNumber || c.phoneNumber || '' };
  });
};
