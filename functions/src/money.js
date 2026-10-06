// functions/src/money.js
//
// ALL money movement for in-app purchases happens here, on the server, inside one Firestore
// transaction per action. The browser only says WHAT the fan wants ("tip $5", "book a 30-min video
// call"); the server looks up the real price, checks the balance, debits the fan, pays the creator
// (80% / 90% ambassador creators / 80+5 referred), records everything, and returns the result.
//
// Balances (single source of truth):
//   fan spending money  → user_balances/{uid}.balance   (USD; wallets/{uid}.balanceMinor mirrors it)
//   creator earnings    → creator_balances/{uid}.availableBalance (USD)
//
// Idempotency: every action carries a client requestId. Retrying the same request (double tap,
// flaky network, "did it go through?") returns the first result and never charges twice.

const admin = require("firebase-admin");
const { HttpsError } = require("firebase-functions/v2/https");
const { resolveSplit, writeReferral } = require("./ledger");
const { assertBalanced } = require("./ledger-math");
const P = require("./pricing");

const FV = admin.firestore.FieldValue;
const EARNINGS_SHARDS = 10;
const STALE_BOOKING_GRACE_MS = 30 * 60 * 1000;
const OPEN_BOOKING = ["confirmed", "in_progress"];

const fail = (code, msg) => { throw new HttpsError(code, msg); };
const money = (minor) => `$${(minor / 100).toFixed(2)}`;
const month = () => new Date().toLocaleString("en-US", { month: "short" });
const toMinor = (usd) => Math.round(Number(usd) * 100);

function cleanId(s) {
  const v = String(s || "").replace(/[^\w-]/g, "").slice(0, 64);
  if (v.length < 8) fail("invalid-argument", "Missing request id");
  return v;
}

async function fanName(db, uid) {
  const s = await db.doc(`users/${uid}`).get();
  const d = s.exists ? s.data() : {};
  return {
    name: d.displayName || d.username || "Someone",
    username: d.username || null,
    avatar: d.profilePicture || d.avatar || null,
  };
}

// ── Core: one sale inside a transaction ───────────────────────────────────────
// Phase A (reads) — call before any tx write.
async function prepareSale(tx, db, { fanUid, creatorId, grossMinor }) {
  if (!Number.isInteger(grossMinor) || grossMinor <= 0) fail("invalid-argument", "Invalid amount");
  if (fanUid === creatorId) fail("failed-precondition", "You can't pay yourself");
  const split = await resolveSplit(tx, db, creatorId, grossMinor);
  const balRef = db.doc(`user_balances/${fanUid}`);
  const balSnap = await tx.get(balRef);
  const balanceMinor = balSnap.exists ? Math.round(Number(balSnap.get("balance") || 0) * 100) : 0;
  if (balanceMinor < grossMinor) {
    fail("failed-precondition", `Insufficient balance. You have ${money(balanceMinor)} but need ${money(grossMinor)}. Please top up your wallet.`);
  }
  return { split, balanceMinor };
}

// Phase B (writes)
function writeSale(tx, db, prep, { txId, fanUid, creatorId, grossMinor, type, description, meta = {}, result = {} }) {
  const { split, balanceMinor } = prep;
  const { creatorNet, platformFee, referralFee, feeBps } = split;
  const now = FV.serverTimestamp();
  const after = balanceMinor - grossMinor;

  const lines = [
    { account: `fan:${fanUid}`, deltaMinor: -grossMinor },
    { account: `creator:${creatorId}:available`, deltaMinor: creatorNet },
    { account: "platform:revenue", deltaMinor: platformFee },
  ];
  if (referralFee > 0) lines.push({ account: `ambassador:${split.referrerId}`, deltaMinor: referralFee });
  assertBalanced(lines);

  tx.set(db.doc(`ledger/${txId}`), {
    type, fanId: fanUid, creatorId, grossMinor, creatorNetMinor: creatorNet, platformFeeMinor: platformFee,
    referralFeeMinor: referralFee, referrerId: split.referrerId || null, feeBps: feeBps ?? null,
    lines, idempotencyKey: txId, meta, result, createdAt: now,
  });
  tx.set(db.doc(`user_balances/${fanUid}`), { userId: fanUid, balance: after / 100, updatedAt: now }, { merge: true });
  tx.set(db.doc(`wallets/${fanUid}`), { userId: fanUid, balanceMinor: after, updatedAt: now }, { merge: true });
  tx.set(db.doc(`creator_balances/${creatorId}`), {
    creatorId,
    availableBalance: FV.increment(creatorNet / 100),
    totalEarnings: FV.increment(creatorNet / 100),
    monthlyEarnings: { [month()]: FV.increment(creatorNet / 100) },
    updatedAt: now,
  }, { merge: true });
  tx.set(db.doc(`creatorEarnings/${creatorId}/shards/${Math.floor(Math.random() * EARNINGS_SHARDS)}`),
    { availableMinor: FV.increment(creatorNet) }, { merge: true });
  tx.set(db.doc(`purchases/${txId}`), {
    creatorId, fanId: fanUid, type, grossMinor, feeBps: feeBps ?? null, platformFeeMinor: platformFee,
    referralFeeMinor: referralFee, creatorNetMinor: creatorNet, ...meta, createdAt: now,
  });
  tx.set(db.doc(`creators/${creatorId}/fans/${fanUid}`),
    { lifetimeSpendMinor: FV.increment(grossMinor), lastPurchaseAt: now }, { merge: true });
  tx.set(db.collection("transactions").doc(`${txId}_debit`), {
    userId: fanUid, creatorId, amount: -grossMinor / 100, type: "debit", contentType: type,
    description, balanceAfter: after / 100, ledgerTxId: txId, createdAt: now,
  });
  writeReferral(tx, db, split, { creatorId, source: type, ledgerTxId: txId, now });
  return {
    creatorEarning: creatorNet / 100, platformFee: platformFee / 100,
    ambassadorCommission: referralFee / 100, ambassadorId: split.referrerId || null,
    balanceAfter: after / 100,
  };
}

// Reverse a sale (full refund to the fan, take the creator's + ambassador's share back).
// `sale` = { fanUid, creatorId, grossMinor, creatorNetMinor, referralFeeMinor, referrerId, txId }
async function prepareReverse(tx, db, sale) {
  const refundRef = db.doc(`ledger/${sale.txId}_refund`);
  const refs = [refundRef, db.doc(`user_balances/${sale.fanUid}`)];
  if (sale.referralFeeMinor > 0 && sale.referrerId) refs.push(db.doc(`users/${sale.referrerId}`));
  const [refundSnap, balSnap, ambSnap] = await tx.getAll(...refs);
  return {
    already: refundSnap.exists,
    balanceMinor: balSnap.exists ? Math.round(Number(balSnap.get("balance") || 0) * 100) : 0,
    ambUnclaimedMinor: ambSnap && ambSnap.exists ? Math.max(0, Math.round(Number(ambSnap.get("ambassadorBalance") || 0) * 100)) : 0,
  };
}

function writeReverse(tx, db, prep, sale, { reason, description }) {
  if (prep.already) return;
  const now = FV.serverTimestamp();
  const after = prep.balanceMinor + sale.grossMinor;
  const lines = [
    { account: `fan:${sale.fanUid}`, deltaMinor: sale.grossMinor },
    { account: `creator:${sale.creatorId}:available`, deltaMinor: -sale.creatorNetMinor },
    { account: "platform:revenue", deltaMinor: -(sale.grossMinor - sale.creatorNetMinor - (sale.referralFeeMinor || 0)) },
  ];
  if (sale.referralFeeMinor > 0) lines.push({ account: `ambassador:${sale.referrerId}`, deltaMinor: -sale.referralFeeMinor });
  assertBalanced(lines);

  tx.set(db.doc(`ledger/${sale.txId}_refund`), {
    type: "refund", reason, refundOf: sale.txId, fanId: sale.fanUid, creatorId: sale.creatorId,
    grossMinor: sale.grossMinor, lines, createdAt: now,
  });
  tx.set(db.doc(`user_balances/${sale.fanUid}`), { userId: sale.fanUid, balance: after / 100, updatedAt: now }, { merge: true });
  tx.set(db.doc(`wallets/${sale.fanUid}`), { userId: sale.fanUid, balanceMinor: after, updatedAt: now }, { merge: true });
  if (sale.creatorNetMinor > 0) {
    tx.set(db.doc(`creator_balances/${sale.creatorId}`), {
      availableBalance: FV.increment(-sale.creatorNetMinor / 100),
      totalEarnings: FV.increment(-sale.creatorNetMinor / 100),
      monthlyEarnings: { [month()]: FV.increment(-sale.creatorNetMinor / 100) },
      updatedAt: now,
    }, { merge: true });
    tx.set(db.doc(`creatorEarnings/${sale.creatorId}/shards/0`),
      { availableMinor: FV.increment(-sale.creatorNetMinor) }, { merge: true });
  }
  if (sale.referralFeeMinor > 0 && sale.referrerId) {
    // Take the commission back from what the ambassador hasn't claimed yet; anything already
    // claimed comes out of their withdrawable earnings instead
    const fromUnclaimed = Math.min(prep.ambUnclaimedMinor || 0, sale.referralFeeMinor);
    const fromEarnings = sale.referralFeeMinor - fromUnclaimed;
    tx.set(db.doc(`users/${sale.referrerId}`), {
      ambassadorBalance: FV.increment(-fromUnclaimed / 100),
      totalCommissionEarned: FV.increment(-sale.referralFeeMinor / 100),
    }, { merge: true });
    if (fromEarnings > 0) {
      tx.set(db.doc(`creator_balances/${sale.referrerId}`), {
        availableBalance: FV.increment(-fromEarnings / 100), updatedAt: now,
      }, { merge: true });
    }
    tx.set(db.doc(`referralCommissions/${sale.txId}`), { status: "reversed", reversedAt: now }, { merge: true });
  }
  tx.set(db.collection("transactions").doc(`${sale.txId}_refund`), {
    userId: sale.fanUid, creatorId: sale.creatorId, amount: sale.grossMinor / 100, type: "refund",
    description, balanceAfter: after / 100, ledgerTxId: sale.txId, createdAt: now,
  });
}

/** Sale info from a ledger doc (new) or from fields saved on a booking/message (older records). */
function saleFrom(ledgerSnap, legacy) {
  if (ledgerSnap && ledgerSnap.exists) {
    const l = ledgerSnap.data();
    return {
      txId: ledgerSnap.id, fanUid: l.fanId, creatorId: l.creatorId, grossMinor: l.grossMinor,
      creatorNetMinor: l.creatorNetMinor || 0, referralFeeMinor: l.referralFeeMinor || 0, referrerId: l.referrerId || null,
    };
  }
  return {
    txId: legacy.txId, fanUid: legacy.fanUid, creatorId: legacy.creatorId,
    grossMinor: toMinor(legacy.amount || 0),
    creatorNetMinor: toMinor(legacy.creatorEarning ?? (legacy.amount || 0) * 0.8),
    referralFeeMinor: toMinor(legacy.ambassadorCommission || 0),
    referrerId: legacy.ambassadorId || null,
  };
}

// A retry of a request that already went through returns the first result straight away —
// before any re-validation (a slow-network retry must never say "price changed" after charging).
async function prior(db, txId) {
  const s = await db.doc(`ledger/${txId}`).get();
  return s.exists ? { ...(s.get("result") || {}), duplicate: true } : null;
}

// Run fn inside a transaction, once per requestId (returns the stored result on retries).
async function once(db, txId, fn) {
  return db.runTransaction(async (tx) => {
    const done = await tx.get(db.doc(`ledger/${txId}`));
    if (done.exists) return { ...(done.get("result") || {}), duplicate: true };
    return fn(tx);
  });
}

// ── Tips ──────────────────────────────────────────────────────────────────────
async function tip(db, uid, d) {
  const early = await prior(db, `tip_${uid}_${cleanId(d.requestId)}`);
  if (early) return early;
  const creatorId = String(d.creatorId || "");
  const amount = P.round2(d.amount);
  if (!creatorId) fail("invalid-argument", "Missing creator");
  if (!(amount >= 1 && amount <= 10000)) fail("invalid-argument", "Tip must be between $1 and $10,000");
  const creator = await db.doc(`users/${creatorId}`).get();
  if (!creator.exists) fail("not-found", "Creator not found");
  const me = await fanName(db, uid);
  const txId = `tip_${uid}_${cleanId(d.requestId)}`;
  const gift = d.giftId ? {
    giftId: String(d.giftId).slice(0, 40), giftEmoji: String(d.giftEmoji || "").slice(0, 8), giftName: String(d.giftName || "").slice(0, 40),
  } : { giftId: null, giftEmoji: null, giftName: null };
  const message = d.message ? String(d.message).slice(0, 500) : null;

  return once(db, txId, async (tx) => {
    const grossMinor = toMinor(amount);
    const prep = await prepareSale(tx, db, { fanUid: uid, creatorId, grossMinor });
    const result = { tipId: txId, amount };
    const s = writeSale(tx, db, prep, {
      txId, fanUid: uid, creatorId, grossMinor, type: "tip",
      description: `Tip to ${creator.get("displayName") || "creator"}${gift.giftEmoji ? ` (${gift.giftEmoji} ${gift.giftName})` : ""}`,
      meta: { ...gift }, result,
    });
    tx.set(db.doc(`tips/${txId}`), {
      fromUserId: uid, toCreatorId: creatorId, amount, creatorEarning: s.creatorEarning, platformFee: s.platformFee,
      ambassadorCommission: s.ambassadorCommission, ambassadorId: s.ambassadorId, ...gift, message,
      ledgerTxId: txId, createdAt: FV.serverTimestamp(),
    });
    tx.set(db.collection("notifications").doc(), {
      type: "tip", userId: creatorId, actorId: uid, actorName: me.name, actorAvatar: me.avatar, actorUsername: me.username,
      message: `sent you a tip of $${amount.toFixed(2)}`, amount, read: false, createdAt: FV.serverTimestamp(),
    });
    return { ...result, balanceAfter: s.balanceAfter };
  });
}

// ── Calls ─────────────────────────────────────────────────────────────────────
const isOpenBooking = (b, now) => {
  if (!OPEN_BOOKING.includes(b.status)) return false;
  const start = P.toMillis(b.scheduledAt) || 0;
  return now < start + (b.duration || 30) * 60000 + STALE_BOOKING_GRACE_MS;
};

async function creatorCallStatus(db, creatorId) {
  const snap = await db.collection("call_bookings").where("creatorId", "==", creatorId)
    .where("status", "in", OPEN_BOOKING).get();
  const now = Date.now();
  const open = snap.docs.map((x) => x.data()).filter((b) => isOpenBooking(b, now))
    .sort((a, b) => (P.toMillis(a.scheduledAt) || 0) - (P.toMillis(b.scheduledAt) || 0));
  if (!open.length) return { busy: false };
  return { busy: true, scheduledAt: P.toMillis(open[0].scheduledAt), status: open[0].status };
}

async function bookCall(db, uid, d) {
  const early = await prior(db, `call_${uid}_${cleanId(d.requestId)}`);
  if (early) return early;
  const creatorId = String(d.creatorId || "");
  const type = d.callType === "voice" ? "voice" : "video";
  const duration = Number(d.duration);
  const scheduledMs = Number(d.scheduledAt);
  const note = d.note ? String(d.note).slice(0, 500) : "";
  if (!creatorId || creatorId === uid) fail("invalid-argument", "Invalid creator");
  if (!P.CALL_DURATIONS.includes(duration)) fail("invalid-argument", "Invalid call length");
  const now = Date.now();
  if (!Number.isFinite(scheduledMs) || scheduledMs < now + 60 * 1000) fail("invalid-argument", "Pick a time at least 2 minutes from now");
  if (scheduledMs > now + 60 * 24 * 3600 * 1000) fail("invalid-argument", "Bookings can be made up to 60 days ahead");

  const [creatorSnap, availSnap, subSnap] = await Promise.all([
    db.doc(`users/${creatorId}`).get(),
    db.doc(`creator_availability/${creatorId}`).get(),
    db.doc(`subscriptions/${uid}_${creatorId}`).get(),
  ]);
  if (!creatorSnap.exists) fail("not-found", "Creator not found");
  const creatorUser = creatorSnap.data();
  const avail = availSnap.exists ? availSnap.data() : {};
  if ((avail.callsEnabled ?? creatorUser.callsEnabled ?? true) === false) fail("failed-precondition", "This creator isn't taking calls right now");
  const tier = P.activeTier(subSnap.exists ? subSnap.data() : null);
  const price = P.callPrice({ type, duration, creatorUser, availability: avail, tier });
  if (d.expectedPrice != null && Math.abs(Number(d.expectedPrice) - price) > 0.009) {
    fail("failed-precondition", `The price changed to $${price.toFixed(2)} — please review and book again`);
  }
  const me = await fanName(db, uid);
  const txId = `call_${uid}_${cleanId(d.requestId)}`;
  const bookingRef = db.collection("call_bookings").doc();

  return once(db, txId, async (tx) => {
    // One open booking per creator, and per fan
    const [cOpen, fOpen] = await Promise.all([
      tx.get(db.collection("call_bookings").where("creatorId", "==", creatorId).where("status", "in", OPEN_BOOKING)),
      tx.get(db.collection("call_bookings").where("userId", "==", uid).where("status", "in", OPEN_BOOKING)),
    ]);
    const t = Date.now();
    if (cOpen.docs.some((x) => isOpenBooking(x.data(), t))) {
      fail("failed-precondition", "This creator already has a call booked. New bookings open once that call is completed or cancelled.");
    }
    if (fOpen.docs.some((x) => isOpenBooking(x.data(), t))) {
      fail("failed-precondition", "You already have an active booking. Finish or cancel it first.");
    }
    const grossMinor = toMinor(price);
    const prep = await prepareSale(tx, db, { fanUid: uid, creatorId, grossMinor });
    const result = { bookingId: bookingRef.id, price };
    const s = writeSale(tx, db, prep, {
      txId, fanUid: uid, creatorId, grossMinor, type: `${type}_call`,
      description: `${type === "voice" ? "Voice" : "Video"} call booking`, meta: { bookingId: bookingRef.id }, result,
    });
    const scheduled = admin.firestore.Timestamp.fromMillis(scheduledMs);
    tx.set(bookingRef, {
      type, creatorId, userId: uid, duration, price, creatorEarning: s.creatorEarning, platformFee: s.platformFee,
      ambassadorCommission: s.ambassadorCommission, ambassadorId: s.ambassadorId, scheduledAt: scheduled, note,
      status: "confirmed", creatorPaid: true, userEnded: false, creatorEnded: false, ledgerTxId: txId,
      tier: tier || null, createdAt: FV.serverTimestamp(),
    });
    const when = new Date(scheduledMs).toUTCString();
    tx.set(db.collection("notifications").doc(), {
      userId: creatorId, type: "call_booking", actorId: uid, actorName: me.name, actorAvatar: me.avatar,
      message: `booked a ${duration}-min ${type} call for ${when}`, bookingId: bookingRef.id,
      scheduledAt: scheduled, read: false, createdAt: FV.serverTimestamp(),
    });
    tx.set(db.collection("scheduled_notifications").doc(), {
      userIds: [uid, creatorId], type: "call_reminder",
      message: `Your ${duration}-min ${type} call starts in 2 minutes! Join the waiting room now.`,
      bookingId: bookingRef.id, sendAt: new Date(Math.max(Date.now(), scheduledMs - 2 * 60 * 1000)),
      sent: false, createdAt: FV.serverTimestamp(),
    });
    return { ...result, balanceAfter: s.balanceAfter };
  });
}

/** Cancel (fan) / reject (creator) / no-show refund (either side, after the slot). Full refund. */
async function refundCall(db, uid, d) {
  const bookingRef = db.doc(`call_bookings/${String(d.bookingId || "")}`);
  const reason = d.reason ? String(d.reason).slice(0, 300) : null;
  let notify = null;
  const out = await db.runTransaction(async (tx) => {
    const bSnap = await tx.get(bookingRef);
    if (!bSnap.exists) fail("not-found", "Booking not found");
    const b = bSnap.data();
    const byCreator = b.creatorId === uid;
    if (!byCreator && b.userId !== uid) fail("permission-denied", "You're not part of this booking");
    const endMs = (P.toMillis(b.scheduledAt) || 0) + (b.duration || 30) * 60000;
    const slotOver = Date.now() >= endMs - 60 * 1000;
    // A call the creator "started" alone, that the fan never joined, is a no-show too
    const fanNeverJoined = b.status === "in_progress" && slotOver && !b.userEnteredCallAt;
    // …and so is one the creator never showed up to (the fan waited alone)
    const creatorNeverJoined = b.status === "in_progress" && slotOver && !b.creatorEnteredCallAt;
    const noShow = fanNeverJoined || creatorNeverJoined;
    if (b.status !== "confirmed" && !noShow) fail("failed-precondition", `This call can't be refunded (status: ${b.status})`);
    const expired = (slotOver && !b.callStartedAt) || noShow;
    const status = byCreator && !expired ? "rejected" : expired ? "refunded" : "cancelled";

    if (!b.ledgerTxId && b.legacyVerified !== true) {
      // Bookings made before server payments could have been created with any price — an admin
      // checks these by hand (Admin → refunds) instead of refunding automatically.
      fail("failed-precondition", "This booking was made before our payment upgrade — support will process the refund. Contact support@unlukt.com");
    }
    const ledgerSnap = b.ledgerTxId ? await tx.get(db.doc(`ledger/${b.ledgerTxId}`)) : null;
    const sale = saleFrom(ledgerSnap, {
      txId: b.ledgerTxId || `legacy_call_${bSnap.id}`, fanUid: b.userId, creatorId: b.creatorId,
      amount: b.price, creatorEarning: b.creatorPaid === false ? 0 : b.creatorEarning,
      ambassadorCommission: b.ambassadorCommission, ambassadorId: b.ambassadorId,
    });
    const prep = await prepareReverse(tx, db, sale);
    const kind = b.type === "voice" ? "voice" : "video";
    writeReverse(tx, db, prep, sale, {
      reason: status,
      description: status === "rejected" ? `Creator declined ${kind} call — refund`
        : status === "cancelled" ? `You cancelled a ${kind} call — refund` : "Call not initiated — automatic refund",
    });
    tx.update(bookingRef, {
      status, refundedAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp(),
      cancelledBy: status === "refunded" ? "system" : byCreator ? "creator" : "user", cancelReason: reason,
    });
    const price = (sale.grossMinor / 100).toFixed(2);
    notify = { b, status, kind, price };
    return { status, refunded: sale.grossMinor / 100 };
  });

  // Notifications (outside the transaction — never block the refund)
  const { b, status, kind, price } = notify;
  const fanMsg = status === "rejected"
    ? `The creator declined your ${kind} call${reason ? `: "${reason}"` : ""}. $${price} is back in your wallet.`
    : status === "cancelled" ? `You cancelled your ${kind} call. $${price} is back in your wallet.`
      : `Your $${price} booking was refunded — the call was not initiated in time.`;
  const batch = db.batch();
  batch.set(db.collection("notifications").doc(), {
    userId: b.userId, type: "refund", message: fanMsg, bookingId: bookingRef.id, read: false, createdAt: FV.serverTimestamp(),
  });
  if (status !== "rejected") {
    batch.set(db.collection("notifications").doc(), {
      userId: b.creatorId, type: "call_cancelled",
      message: status === "cancelled"
        ? `A fan cancelled their ${kind} call. You're open for bookings again.`
        : `A ${kind} call wasn't started in time and the fan was refunded. You're open for bookings again.`,
      bookingId: bookingRef.id, read: false, createdAt: FV.serverTimestamp(),
    });
  }
  await batch.commit().catch(() => {});
  return out;
}

/** Older bookings paid the creator on completion — release that earning (once). */
async function releaseCall(db, uid, d) {
  const ref = db.doc(`call_bookings/${String(d.bookingId || "")}`);
  return db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) fail("not-found", "Booking not found");
    const b = s.data();
    if (b.userId !== uid && b.creatorId !== uid) fail("permission-denied", "Not your booking");
    if (b.status !== "completed" || b.creatorPaid !== false || !(b.creatorEarning > 0)) return { released: false };
    // Old-style bookings could be forged with any earning → only admin-verified ones, capped at 90%
    if (b.legacyVerified !== true) return { released: false, needsReview: true };
    b.creatorEarning = Math.min(Number(b.creatorEarning), P.round2(Number(b.price || 0) * 0.9));
    tx.set(db.doc(`creator_balances/${b.creatorId}`), {
      creatorId: b.creatorId,
      availableBalance: FV.increment(b.creatorEarning), totalEarnings: FV.increment(b.creatorEarning),
      monthlyEarnings: { [month()]: FV.increment(b.creatorEarning) }, updatedAt: FV.serverTimestamp(),
    }, { merge: true });
    tx.update(ref, { creatorPaid: true });
    return { released: true };
  });
}

// ── Subscriptions ─────────────────────────────────────────────────────────────
async function subscribe(db, uid, d) {
  const early = await prior(db, `sub_${uid}_${cleanId(d.requestId)}`);
  if (early) return early;
  const creatorId = String(d.creatorId || "");
  const tier = String(d.tier || "supporter");
  const duration = String(d.duration || "monthly");
  if (!creatorId || creatorId === uid) fail("invalid-argument", "You can't subscribe to yourself");
  const [creatorSnap, tiersSnap, discSnap, prevSub] = await Promise.all([
    db.doc(`users/${creatorId}`).get(),
    db.doc(`creator_tiers/${creatorId}`).get(),
    db.doc(`creator_discounts/${creatorId}`).get(),
    db.doc(`subscriptions/${uid}_${creatorId}`).get(),
  ]);
  if (!creatorSnap.exists) fail("not-found", "Creator not found");
  let price;
  try {
    price = P.subscriptionPrice({
      tier, duration, tiersDoc: tiersSnap.exists ? tiersSnap.data() : null,
      creatorUser: creatorSnap.data(), discounts: discSnap.exists ? discSnap.data() : null,
      isFirst: !prevSub.exists, // "first month" discounts are for new subscribers only
    });
  } catch (e) { fail("invalid-argument", e.message); }
  if (d.expectedPrice != null && Math.abs(Number(d.expectedPrice) - price) > 0.009) {
    fail("failed-precondition", `The price changed to $${price.toFixed(2)} — please review and subscribe again`);
  }
  const me = await fanName(db, uid);
  const creatorName = creatorSnap.get("displayName") || "Creator";
  const txId = `sub_${uid}_${cleanId(d.requestId)}`;
  const subRef = db.doc(`subscriptions/${uid}_${creatorId}`);
  const days = P.SUB_DAYS[duration];
  const label = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" }[duration];

  return once(db, txId, async (tx) => {
    const subSnap = await tx.get(subRef);
    const grossMinor = toMinor(price);
    const prep = await prepareSale(tx, db, { fanUid: uid, creatorId, grossMinor });
    const existing = subSnap.exists ? subSnap.data() : null;
    const curExp = existing ? P.toMillis(existing.expiresAt) : null;
    const base = curExp && curExp > Date.now() && ["active", "cancelled"].includes(existing.status) ? curExp : Date.now();
    const expiresMs = base + days * 24 * 3600 * 1000;
    const result = { price, expiresAt: expiresMs, duration, tier };
    const s = writeSale(tx, db, prep, {
      txId, fanUid: uid, creatorId, grossMinor, type: "subscription",
      description: `${tier.toUpperCase()} subscription to ${creatorName} (${label})`, meta: { tier, duration }, result,
    });
    const subData = {
      userId: uid, creatorId, status: "active", duration, durationLabel: label, tier, amount: price,
      creatorEarning: s.creatorEarning, platformFee: s.platformFee, ambassadorCommission: s.ambassadorCommission,
      ambassadorId: s.ambassadorId, expiresAt: admin.firestore.Timestamp.fromMillis(expiresMs),
      ledgerTxId: txId, updatedAt: FV.serverTimestamp(),
    };
    if (!existing) subData.createdAt = FV.serverTimestamp();
    tx.set(subRef, subData, { merge: true });
    if (!existing || existing.status !== "active") { // cancel decremented the count; renewing adds it back
      tx.set(db.doc(`users/${creatorId}`), { subscribersCount: FV.increment(1) }, { merge: true });
    }
    tx.set(db.doc(`creators/${creatorId}/fans/${uid}`), {
      tier, subscribedAt: existing?.createdAt || FV.serverTimestamp(), lastSubscribedAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp(),
    }, { merge: true });
    tx.set(db.collection("subscription_transactions").doc(txId), {
      userId: uid, creatorId, duration, durationLabel: label, amount: price, creatorEarning: s.creatorEarning,
      platformFee: s.platformFee, ambassadorCommission: s.ambassadorCommission, ambassadorId: s.ambassadorId,
      expiresAt: admin.firestore.Timestamp.fromMillis(expiresMs), createdAt: FV.serverTimestamp(),
    });
    tx.set(db.collection("notifications").doc(), {
      type: "subscriber", userId: creatorId, actorId: uid, actorName: me.name, actorAvatar: me.avatar,
      actorUsername: me.username, message: "subscribed to your profile", read: false, createdAt: FV.serverTimestamp(),
    });
    return { ...result, balanceAfter: s.balanceAfter };
  });
}

// ── Communities ───────────────────────────────────────────────────────────────
async function joinCommunity(db, uid, d) {
  const early = await prior(db, `community_${uid}_${cleanId(d.requestId)}`);
  if (early) return early;
  const communityId = String(d.communityId || "");
  // The app sends 'onetime' for lifetime access
  const joinType = ["once", "onetime", "lifetime"].includes(d.joinType) ? "once" : "monthly";
  const cSnap = await db.doc(`communities/${communityId}`).get();
  if (!cSnap.exists) fail("not-found", "Community not found");
  const c = cSnap.data();
  const free = c.isPrivate === false;
  const price = free ? 0 : P.round2(joinType === "monthly" ? (c.price || 9.99) : (c.oneTimePrice || (c.price || 9.99) * 3));
  if (d.expectedPrice != null && Math.abs(Number(d.expectedPrice) - price) > 0.009) {
    fail("failed-precondition", `The price changed to $${price.toFixed(2)} — please review and join again`);
  }
  const memberRef = db.doc(`community_members/${uid}_${communityId}`);
  const txId = `community_${uid}_${cleanId(d.requestId)}`;

  return once(db, txId, async (tx) => {
    const mSnap = await tx.get(memberRef);
    const m = mSnap.exists ? mSnap.data() : null;
    const endMs = m ? P.toMillis(m.subscriptionEnd) : null;
    if (m && m.subscriptionStatus === "active" && (!endMs || endMs > Date.now())) return { alreadyMember: true };
    const isOwner = c.creatorId === uid;
    let s = null;
    let prep = null;
    if (price > 0 && !isOwner) prep = await prepareSale(tx, db, { fanUid: uid, creatorId: c.creatorId, grossMinor: toMinor(price) });
    const subscriptionEnd = !free && joinType === "monthly" ? admin.firestore.Timestamp.fromMillis(Date.now() + 30 * 24 * 3600 * 1000) : null;
    const result = { joined: true, price: prep ? price : 0 };
    if (prep) {
      s = writeSale(tx, db, prep, {
        txId, fanUid: uid, creatorId: c.creatorId, grossMinor: toMinor(price), type: "community_join",
        description: `Community join: ${c.name || "community"}`, meta: { communityId, joinType }, result,
      });
    } else {
      tx.set(db.doc(`ledger/${txId}`), { type: "community_join_free", fanId: uid, communityId, lines: [], result, createdAt: FV.serverTimestamp() });
    }
    tx.set(memberRef, {
      id: `${uid}_${communityId}`, communityId, userId: uid, role: m?.role || "member",
      joinedAt: m?.joinedAt || FV.serverTimestamp(), subscriptionStatus: "active", subscriptionEnd,
      joinType: free ? "free" : joinType, lastActive: FV.serverTimestamp(), ledgerTxId: prep ? txId : null,
    }, { merge: true });
    if (!m) {
      tx.set(db.doc(`communities/${communityId}`), { memberCount: FV.increment(1) }, { merge: true });
      tx.set(db.doc(`users/${uid}`), { communitiesJoined: FV.increment(1) }, { merge: true });
    }
    return { ...result, balanceAfter: s?.balanceAfter };
  });
}

// ── Live: tips, requests, questions, guest requests ───────────────────────────
async function livePay(db, uid, d) {
  const early = await prior(db, `live_${uid}_${cleanId(d.requestId)}`);
  if (early) return early;
  const creatorId = String(d.creatorId || "");
  const action = String(d.action || "");
  if (!["tip", "request", "question", "guest"].includes(action)) fail("invalid-argument", "Unknown live action");
  if (!creatorId || creatorId === uid) fail("invalid-argument", "Invalid creator");
  const [roomSnap, creatorSnap] = await Promise.all([
    db.doc(`livestream_rooms/${creatorId}`).get(), db.doc(`users/${creatorId}`).get(),
  ]);
  if (!creatorSnap.exists) fail("not-found", "Creator not found");
  if (!roomSnap.exists || creatorSnap.get("is_live") !== true) fail("failed-precondition", "This creator isn't live right now");
  const st = P.liveSettings(roomSnap.get("settings") || creatorSnap.get("liveSettings"));
  const text = d.text ? String(d.text).slice(0, 300) : "";
  let amount = 0;
  let msg;
  if (action === "tip") {
    amount = Math.floor(Number(d.amount));
    if (!(amount >= 1 && amount <= 10000)) fail("invalid-argument", "Tip must be at least 1");
    msg = { type: "tip", text: `tipped ${amount} 🌹` };
  } else if (action === "question") {
    if (st.questionsEnabled === false) fail("failed-precondition", "Questions are off for this live");
    if (!text.trim()) fail("invalid-argument", "Write your question");
    amount = st.questionPrice;
    msg = { type: "question", text, status: "pending" };
  } else if (action === "guest") {
    if (st.guestEnabled === false) fail("failed-precondition", "Guest requests are off for this live");
    if ((roomSnap.get("stageGuests") || []).some((g) => g?.userId === uid)) fail("failed-precondition", "You're already on stage");
    amount = st.guestPrice;
    msg = { type: "stage_request", text: "wants to join on camera", status: "pending" };
  } else {
    if (st.requestsEnabled === false) fail("failed-precondition", "Requests are off for this live");
    const label = String(d.label || "").trim().slice(0, 40);
    const item = st.requestMenu.find((i) => i.label === label);
    if (item) amount = item.price;
    else {
      if (!st.allowCustomRequest) fail("failed-precondition", "Pick an item from the menu");
      amount = Math.floor(Number(d.amount));
      if (!(amount >= st.customRequestMin)) fail("invalid-argument", `Custom requests start at ${st.customRequestMin}`);
      if (amount > 10000) fail("invalid-argument", "Amount too large");
    }
    msg = { type: "custom_request", label: label || "Custom request", text, status: "pending" };
  }
  if (action !== "tip" && d.expectedPrice != null && Number(d.expectedPrice) !== amount) {
    fail("failed-precondition", `The price changed to ${amount} — please try again`);
  }
  const me = await fanName(db, uid);
  const txId = `live_${uid}_${cleanId(d.requestId)}`;
  const msgRef = db.collection(`livestream_rooms/${creatorId}/messages`).doc();

  return once(db, txId, async (tx) => {
    let s = null;
    const result = { messageId: msgRef.id, amount };
    if (amount > 0) {
      const prep = await prepareSale(tx, db, { fanUid: uid, creatorId, grossMinor: toMinor(amount) });
      s = writeSale(tx, db, prep, {
        txId, fanUid: uid, creatorId, grossMinor: toMinor(amount), type: `live_${action}`,
        description: action === "tip" ? `Live tip to @${creatorSnap.get("username") || "creator"}`
          : `Live ${action} for @${creatorSnap.get("username") || "creator"}`,
        meta: { messageId: msgRef.id }, result,
      });
    } else {
      tx.set(db.doc(`ledger/${txId}`), { type: `live_${action}_free`, fanId: uid, creatorId, lines: [], result, createdAt: FV.serverTimestamp() });
    }
    tx.set(msgRef, {
      ...msg, userId: uid, username: me.username || me.name, avatar: me.avatar, amount,
      creatorEarning: s ? s.creatorEarning : 0, ledgerTxId: amount > 0 ? txId : null, createdAt: FV.serverTimestamp(),
    });
    return { ...result, balanceAfter: s?.balanceAfter };
  });
}

/** Creator declines a paid live request/question/guest request → fan refunded in full. */
async function liveDecline(db, uid, d) {
  const msgRef = db.doc(`livestream_rooms/${uid}/messages/${String(d.messageId || "")}`);
  return db.runTransaction(async (tx) => {
    const m = await tx.get(msgRef);
    if (!m.exists) fail("not-found", "Request not found");
    const x = m.data();
    if (x.status !== "pending") return { status: x.status };
    if (x.amount > 0 && !x.ledgerTxId) {
      // Before server payments, live messages could carry any amount — decline without auto-refund
      tx.update(msgRef, { status: "declined", declinedAt: FV.serverTimestamp(), refundNeedsReview: true });
      return { status: "declined", refunded: 0, needsReview: true };
    }
    if (x.amount > 0) {
      const ledgerSnap = x.ledgerTxId ? await tx.get(db.doc(`ledger/${x.ledgerTxId}`)) : null;
      // The message must point at THIS creator's own live sale (a creator can edit their room's messages)
      if (!ledgerSnap || !ledgerSnap.exists || ledgerSnap.get("creatorId") !== uid
          || !String(ledgerSnap.get("type") || "").startsWith("live_") || ledgerSnap.get("meta")?.messageId !== m.id) {
        fail("failed-precondition", "This request can't be refunded automatically — contact support");
      }
      const sale = saleFrom(ledgerSnap, {
        txId: x.ledgerTxId || `legacy_live_${m.id}`, fanUid: x.userId, creatorId: uid,
        amount: x.amount, creatorEarning: x.creatorEarning,
      });
      const prep = await prepareReverse(tx, db, sale);
      writeReverse(tx, db, prep, sale, { reason: "live_declined", description: "Live request declined — refund" });
    }
    tx.update(msgRef, { status: "declined", declinedAt: FV.serverTimestamp() });
    return { status: "declined", refunded: x.amount || 0 };
  });
}

/** Live entry ticket (1 hour) for a paid live. Used by getAgoraToken. */
async function buyLiveTicket(db, uid, creatorId) {
  const creatorSnap = await db.doc(`users/${creatorId}`).get();
  if (!creatorSnap.exists) fail("not-found", "Creator profile not found");
  const roomSnap = await db.doc(`livestream_rooms/${creatorId}`).get();
  const st = P.liveSettings((roomSnap.exists && roomSnap.get("settings")) || creatorSnap.get("liveSettings") || {});
  // Price shown in the live room (room settings) wins over the profile field
  const price = roomSnap.exists && roomSnap.get("settings") ? st.entryPrice : Number(creatorSnap.get("livestreamPrice") || st.entryPrice || 10);
  const hour = Math.floor(Date.now() / 3600000);
  const txId = `ticket_${uid}_${creatorId}_${hour}`;
  return once(db, txId, async (tx) => {
    const grossMinor = toMinor(price);
    const prep = await prepareSale(tx, db, { fanUid: uid, creatorId, grossMinor });
    const ticketRef = db.collection("livestream_tickets").doc(txId);
    const result = { ticketId: ticketRef.id, price };
    writeSale(tx, db, prep, {
      txId, fanUid: uid, creatorId, grossMinor, type: "live_ticket",
      description: `Livestream 1-hour ticket: @${creatorSnap.get("username") || "creator"}`, result,
    });
    tx.set(ticketRef, {
      userId: uid, creatorId, price, ledgerTxId: txId, createdAt: FV.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 3600 * 1000),
    });
    return result;
  });
}

// ── Ambassador: move commission into withdrawable earnings ────────────────────
async function claimAmbassador(db, uid) {
  return db.runTransaction(async (tx) => {
    const u = await tx.get(db.doc(`users/${uid}`));
    const bal = P.round2(u.exists ? Number(u.get("ambassadorBalance") || 0) : 0);
    if (!(bal > 0)) return { moved: 0 };
    const now = FV.serverTimestamp();
    tx.set(db.doc(`creator_balances/${uid}`), {
      creatorId: uid, availableBalance: FV.increment(bal), totalEarnings: FV.increment(bal), updatedAt: now,
    }, { merge: true });
    tx.update(db.doc(`users/${uid}`), { ambassadorBalance: 0 });
    tx.set(db.collection("ledger").doc(), {
      type: "ambassador_claim", ambassadorId: uid, amountMinor: toMinor(bal),
      lines: [{ account: `ambassador:${uid}`, deltaMinor: -toMinor(bal) }, { account: `creator:${uid}:available`, deltaMinor: toMinor(bal) }],
      createdAt: now,
    });
    return { moved: bal };
  });
}

// ── Admin: approve / reject a manual top-up (NGN bank transfer, or crypto by hand) ──
// One transaction: status check + credit, so a double-click can't credit twice. NGN dollars are
// re-computed from the naira amount and the platform rate (the buyer's browser chose the stored one).
async function adminTopup(db, adminUid, d) {
  const kind = d.kind === "crypto" ? "crypto" : "ngn";
  const id = String(d.paymentId || "");
  const approve = d.approve !== false;
  const note = d.note ? String(d.note).slice(0, 300) : null;
  const ref = db.doc(`${kind === "ngn" ? "ngn_payments" : "crypto_payments"}/${id}`);
  const rateSnap = kind === "ngn" ? await db.doc("settings/ngn_rate").get() : null;

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) fail("not-found", "Payment not found");
    const p = snap.data();
    const done = ["approved", "completed", "credited", "rejected", "verified"];
    if (done.includes(p.status) || p.verificationStatus === "verified") {
      fail("failed-precondition", `Already ${p.status}`);
    }
    const now = FV.serverTimestamp();
    if (!approve) {
      tx.update(ref, {
        status: "rejected", verificationStatus: "rejected", adminNote: note || "Payment could not be verified.",
        reviewedBy: adminUid, reviewedAt: now, updatedAt: now,
      });
      return { status: "rejected" };
    }
    let usd;
    if (kind === "ngn") {
      const r = rateSnap && rateSnap.exists ? rateSnap.data() : {};
      const rate = Number(r.rate || 1550) + Number(r.buffer || 0) + 15;
      const fromNaira = Number(p.amountNGN || 0) / rate;
      // Allow 2% rate movement since the buyer saw the price; never more than they were quoted
      usd = P.round2(Math.min(Number(p.amountUSD || 0), fromNaira * 1.02));
    } else {
      usd = P.round2(Number(p.baseAmount || p.amountDisplay || p.amount || 0));
    }
    if (!(usd > 0)) fail("failed-precondition", "Nothing to credit");
    const balRef = db.doc(`user_balances/${p.userId}`);
    const bal = await tx.get(balRef);
    const after = (bal.exists ? Math.round(Number(bal.get("balance") || 0) * 100) : 0) + toMinor(usd);
    tx.set(balRef, { userId: p.userId, balance: after / 100, updatedAt: now }, { merge: true });
    tx.set(db.doc(`wallets/${p.userId}`), { userId: p.userId, balanceMinor: after, updatedAt: now }, { merge: true });
    tx.set(db.doc(`ledger/topup_${kind}_${id}`), {
      type: `topup_${kind}`, fanId: p.userId, grossMinor: toMinor(usd), approvedBy: adminUid,
      lines: [{ account: `external:${kind}`, deltaMinor: -toMinor(usd) }, { account: `fan:${p.userId}`, deltaMinor: toMinor(usd) }],
      createdAt: now,
    });
    tx.set(db.collection("transactions").doc(`topup_${kind}_${id}`), {
      userId: p.userId, amount: usd, type: "topup", description: kind === "ngn" ? "Wallet top-up (NGN transfer)" : "Wallet top-up (Crypto)",
      paymentId: id, balanceAfter: after / 100, createdAt: now,
    });
    tx.update(ref, {
      status: kind === "ngn" ? "approved" : "completed", verificationStatus: "verified", creditedUSD: usd,
      reviewedBy: adminUid, reviewedAt: now, verifiedBy: adminUid, verifiedAt: now, adminNotes: note, updatedAt: now,
    });
    tx.set(db.collection("notifications").doc(), {
      userId: p.userId, type: "payment_verified", message: `Your top-up was approved — $${usd.toFixed(2)} added to your wallet.`,
      read: false, createdAt: now,
    });
    return { status: "approved", credited: usd };
  });
}

module.exports = {
  tip, bookCall, refundCall, releaseCall, creatorCallStatus, subscribe, joinCommunity,
  livePay, liveDecline, buyLiveTicket, claimAmbassador, adminTopup,
  _internal: { prepareSale, writeSale, saleFrom, isOpenBooking },
};
