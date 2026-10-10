// functions/src/ambassador.js
//
// "The first 50 creators automatically become Ambassadors" (Ambassadors keep 90%, Creators keep 80%).
// A creator counts when their application (KYC) is approved. The count lives in
// counters/founding_ambassadors, which only the server can touch.
// The 90/10 split itself is applied in ledger.js (creator.isAmbassador === true).

const admin = require("firebase-admin");

const FOUNDING_AMBASSADOR_LIMIT = 50;
const COUNTER_PATH = "counters/founding_ambassadors";

/**
 * Give an approved creator one of the 50 Ambassador places, if any are left.
 * Safe to call more than once for the same person: a place is only ever taken once.
 * @returns {Promise<{granted: boolean, number?: number, reason?: string}>}
 */
async function grantFoundingAmbassador(db, uid) {
  const userRef = db.doc(`users/${uid}`);
  const counterRef = db.doc(COUNTER_PATH);
  return db.runTransaction(async (tx) => {
    const [user, counter] = [await tx.get(userRef), await tx.get(counterRef)];
    if (!user.exists) return { granted: false, reason: "no-user" };
    const u = user.data();
    if (u.kycStatus !== "approved") return { granted: false, reason: "not-approved" };
    // Already an Ambassador, or had a place before (an admin may have removed it on purpose)
    if (u.isAmbassador === true || u.role === "ambassador" || u.ambassadorNumber) {
      return { granted: false, reason: "already" };
    }
    const count = counter.exists ? Number(counter.get("count") || 0) : 0;
    if (count >= FOUNDING_AMBASSADOR_LIMIT) return { granted: false, reason: "full" };

    const now = admin.firestore.FieldValue.serverTimestamp();
    const number = count + 1;
    tx.set(counterRef, { count: number, limit: FOUNDING_AMBASSADOR_LIMIT, updatedAt: now }, { merge: true });
    tx.update(userRef, { isAmbassador: true, ambassadorNumber: number, ambassadorSince: now });
    return { granted: true, number };
  });
}

module.exports = { grantFoundingAmbassador, FOUNDING_AMBASSADOR_LIMIT, COUNTER_PATH };
