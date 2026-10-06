// functions/src/ledger.js
const admin = require("firebase-admin");
const { HttpsError } = require("firebase-functions/v2/https");
const {
  STANDARD_FEE_BPS,
  AMBASSADOR_FEE_BPS,
  splitFee,
  splitWithReferral,
  REFERRAL_WINDOW_MS,
  assertBalanced,
  unlockTxId,
  unlockPostTxId,
  topupTxId,
  payoutTxId,
} = require("./ledger-math");

const EARNINGS_SHARDS = 10; // sharded counters to avoid hot-spotting a single document

/**
 * Read everything needed to split a sale for this creator (call inside a transaction, before writes).
 * Model: normal 80/20, ambassador 90/10, referred normal creator 80 / 5 ambassador / 15 platform (1 year).
 */
async function resolveSplit(tx, db, creatorId, grossMinor) {
  const [settingsSnap, creatorSnap] = await tx.getAll(
    db.doc(`creators/${creatorId}/private/settings`),
    db.doc(`users/${creatorId}`)
  );
  const creator = creatorSnap.exists ? creatorSnap.data() : {};
  const isAmbassador = creator.isAmbassador === true || creator.role === "ambassador";

  // Custom per-creator deal set by admin overrides the standard model (no referral cut)
  const overrideBps = settingsSnap.exists ? settingsSnap.get("feeBps") : null;
  if (Number.isInteger(overrideBps)) {
    const { platformFee, creatorNet } = splitFee(grossMinor, overrideBps);
    return { feeBps: overrideBps, creatorNet, platformFee, referralFee: 0, referrerId: null };
  }

  let referrerId = null;
  if (!isAmbassador && creator.referredBy && creator.referredBy !== creatorId) {
    const created = creator.createdAt?.toDate ? creator.createdAt.toDate() : new Date(creator.createdAt || 0);
    if (Date.now() - created.getTime() < REFERRAL_WINDOW_MS) {
      // Only real ambassadors earn referral cuts (stops creators paying 5% to their own alt account)
      const refSnap = await db.doc(`users/${creator.referredBy}`).get();
      const ref = refSnap.exists ? refSnap.data() : {};
      if (ref.role === "ambassador" || ref.isAmbassador === true) referrerId = creator.referredBy;
    }
  }
  return splitWithReferral(grossMinor, { isAmbassador, referrerId });
}

/** Ledger lines + writes for the referring ambassador's 5% (no-op when there is none). */
function writeReferral(tx, db, split, { creatorId, source, ledgerTxId, now }) {
  if (!split.referrerId || split.referralFee <= 0) return;
  tx.set(
    db.doc(`users/${split.referrerId}`),
    {
      ambassadorBalance: admin.firestore.FieldValue.increment(split.referralFee / 100),
      totalCommissionEarned: admin.firestore.FieldValue.increment(split.referralFee / 100),
    },
    { merge: true }
  );
  tx.set(db.doc(`referralCommissions/${ledgerTxId}`), {
    ambassadorId: split.referrerId,
    referredCreatorId: creatorId,
    amount: split.referralFee / 100,
    amountMinor: split.referralFee,
    source,
    ledgerTxId,
    status: "pending",
    createdAt: now,
  });
}

/**
 * Fan unlocks a paid message. One atomic transaction:
 * debit fan, credit creator net (instantly available), credit platform fee.
 * Idempotent: unlocking twice charges once.
 *
 * @param {Object} input
 * @param {string} input.fanUid
 * @param {string} input.conversationId
 * @param {string} input.messageId
 * @returns {Promise<{alreadyUnlocked: boolean, bunnyPath: string, txId: string}>}
 */
async function unlockMessage(input) {
  const db = admin.firestore();
  const { fanUid, conversationId, messageId } = input;

  const unlockRef = db.doc(`unlocks/${messageId}_${fanUid}`);
  const convRef = db.doc(`conversations/${conversationId}`);
  const msgRef = convRef.collection("messages").doc(messageId);
  const privateRef = db.doc(`mediaPrivate/${messageId}`);
  const walletRef = db.doc(`wallets/${fanUid}`);

  return db.runTransaction(async (tx) => {
    // 1. All reads first
    const [unlockSnap, convSnap, msgSnap, privSnap, walletSnap] =
      await tx.getAll(unlockRef, convRef, msgRef, privateRef, walletRef);

    if (!convSnap.exists) {
      throw new HttpsError("not-found", "Conversation not found");
    }

    const convData = convSnap.data() || {};
    // Verify participant
    const isParticipant =
      convData.fanId === fanUid ||
      (Array.isArray(convData.participants) && convData.participants.includes(fanUid));
    if (!isParticipant) {
      throw new HttpsError("permission-denied", "Not your conversation");
    }

    if (!msgSnap.exists) {
      throw new HttpsError("not-found", "Message not found");
    }

    let bunnyPath = privSnap.exists ? privSnap.get("bunnyPath") : null;
    if (!bunnyPath) {
      bunnyPath = msgSnap.get("mediaUrl") || msgSnap.get("content") || "";
    }

    // Idempotency check: already unlocked
    if (unlockSnap.exists) {
      return {
        alreadyUnlocked: true,
        bunnyPath,
        txId: unlockSnap.get("ledgerTxId"),
      };
    }

    if (msgSnap.get("isPPV") !== true) {
      throw new HttpsError("failed-precondition", "Message is not for sale");
    }
    // The money always goes to the person who SENT the paid message (never to a creatorId
    // stored on the conversation — whoever creates a conversation could set that to themselves)
    const sellerId = msgSnap.get("senderId");
    if (!sellerId) throw new HttpsError("failed-precondition", "Sender not found");
    if (sellerId === fanUid) {
      return { alreadyUnlocked: true, bunnyPath, txId: null };
    }

    // Price fixed when the message was sent (snapshot in mediaPrivate), else the message fields
    let priceMinor = privSnap.exists && Number.isInteger(privSnap.get("priceMinor")) ? privSnap.get("priceMinor") : msgSnap.get("priceMinor");
    if (!Number.isInteger(priceMinor)) {
      // Backward compatibility check for price in dollars (float)
      const legacyPrice = msgSnap.get("price") ?? msgSnap.get("unlockPrice");
      if (typeof legacyPrice === "number" && legacyPrice > 0) {
        priceMinor = Math.round(legacyPrice * 100);
      }
    }

    if (!Number.isInteger(priceMinor) || priceMinor <= 0) {
      throw new HttpsError("failed-precondition", "Message is not for sale");
    }

    const creatorId = sellerId;

    const split = await resolveSplit(tx, db, creatorId, priceMinor);
    const feeBps = split.feeBps;

    // Fan balance: user_balances is the single source of truth (wallets only mirrors it).
    // (Reading wallets first could overwrite a newer NGN top-up that only landed in user_balances.)
    void walletSnap;
    const fanBalSnap = await tx.get(db.doc(`user_balances/${fanUid}`));
    const balanceMinor = fanBalSnap.exists ? Math.round(Number(fanBalSnap.get("balance") || 0) * 100) : 0;

    if (balanceMinor < priceMinor) {
      throw new HttpsError("failed-precondition", "Insufficient credits");
    }

    const { platformFee, creatorNet, referralFee } = split;
    const txId = unlockTxId(messageId, fanUid);

    const lines = [
      { account: `fan:${fanUid}`, deltaMinor: -priceMinor },
      { account: `creator:${creatorId}:available`, deltaMinor: creatorNet },
      { account: "platform:revenue", deltaMinor: platformFee },
    ];
    if (referralFee > 0) lines.push({ account: `ambassador:${split.referrerId}`, deltaMinor: referralFee });
    assertBalanced(lines);

    const now = admin.firestore.FieldValue.serverTimestamp();
    const shard = Math.floor(Math.random() * EARNINGS_SHARDS);

    // 2. All writes
    tx.set(db.doc(`ledger/${txId}`), {
      type: "unlock",
      fanId: fanUid,
      creatorId,
      lines,
      idempotencyKey: txId,
      createdAt: now,
    });
    writeReferral(tx, db, split, { creatorId, source: "ppv", ledgerTxId: txId, now });

    tx.set(
      walletRef,
      { balanceMinor: balanceMinor - priceMinor, updatedAt: now },
      { merge: true }
    );

    // Keep legacy user_balances in sync during migration phase
    tx.set(
      db.doc(`user_balances/${fanUid}`),
      { balance: (balanceMinor - priceMinor) / 100, updatedAt: now },
      { merge: true }
    );

    tx.set(
      db.doc(`creatorEarnings/${creatorId}/shards/${shard}`),
      { availableMinor: admin.firestore.FieldValue.increment(creatorNet) },
      { merge: true }
    );

    // Keep legacy creator_balances in sync during migration phase
    tx.set(
      db.doc(`creator_balances/${creatorId}`),
      {
        availableBalance: admin.firestore.FieldValue.increment(creatorNet / 100),
        totalEarnings: admin.firestore.FieldValue.increment(creatorNet / 100),
        updatedAt: now,
      },
      { merge: true }
    );

    tx.set(db.doc(`purchases/${txId}`), {
      creatorId,
      fanId: fanUid,
      messageId,
      grossMinor: priceMinor,
      feeBps, // snapshot so future rate changes never touch history
      platformFeeMinor: platformFee,
      referralFeeMinor: referralFee,
      creatorNetMinor: creatorNet,
      createdAt: now,
    });

    tx.set(
      db.doc(`creators/${creatorId}/fans/${fanUid}`),
      {
        lifetimeSpendMinor: admin.firestore.FieldValue.increment(priceMinor),
        lastPurchaseAt: now,
      },
      { merge: true }
    );

    tx.set(unlockRef, {
      fanId: fanUid,
      creatorId,
      messageId,
      ledgerTxId: txId,
      createdAt: now,
    });

    tx.set(
      msgRef,
      { unlockedBy: admin.firestore.FieldValue.arrayUnion(fanUid) },
      { merge: true }
    );

    return { alreadyUnlocked: false, bunnyPath, txId };
  });
}

/**
 * Credit a fan's wallet after a CONFIRMED crypto payment.
 * Call this only after signature verification and final status check.
 * Idempotent per payment ID.
 *
 * @param {Object} input
 * @param {string} input.providerPaymentId
 * @param {string} input.fanUid
 * @param {number} input.receivedMinor
 * @returns {Promise<{credited: boolean}>}
 */
async function creditTopup(input) {
  const db = admin.firestore();
  const { providerPaymentId, fanUid, receivedMinor } = input;

  if (!Number.isInteger(receivedMinor) || receivedMinor <= 0) {
    throw new HttpsError("invalid-argument", "Invalid received amount");
  }

  const topupRef = db.doc(`topups/${providerPaymentId}`);
  const walletRef = db.doc(`wallets/${fanUid}`);
  const txId = topupTxId(providerPaymentId);

  return db.runTransaction(async (tx) => {
    const topupSnap = await tx.get(topupRef);
    if (topupSnap.exists && topupSnap.get("status") === "credited") {
      return { credited: false }; // repeated webhook, nothing to do
    }

    const lines = [
      { account: "external:crypto", deltaMinor: -receivedMinor },
      { account: `fan:${fanUid}`, deltaMinor: receivedMinor },
    ];
    assertBalanced(lines);

    const now = admin.firestore.FieldValue.serverTimestamp();

    tx.set(db.doc(`ledger/${txId}`), {
      type: "topup",
      lines,
      idempotencyKey: txId,
      createdAt: now,
    });

    tx.set(
      walletRef,
      {
        userId: fanUid,
        balanceMinor: admin.firestore.FieldValue.increment(receivedMinor),
        updatedAt: now,
      },
      { merge: true }
    );

    // Keep legacy user_balances in sync
    tx.set(
      db.doc(`user_balances/${fanUid}`),
      {
        userId: fanUid,
        balance: admin.firestore.FieldValue.increment(receivedMinor / 100),
        updatedAt: now,
      },
      { merge: true }
    );

    tx.set(
      topupRef,
      {
        status: "credited",
        fanUid,
        receivedMinor,
        creditedAt: now,
      },
      { merge: true }
    );

    return { credited: true };
  });
}

/**
 * Creator requests a payout. Payout is reserved and awaits admin approval.
 *
 * @param {Object} input
 * @param {string} input.creatorId
 * @param {string} input.ownerUid
 * @param {number} input.amountMinor
 * @param {string} input.payoutAddress
 * @param {number} [input.networkFeeMinor=100] default $1 TRC20 network fee
 * @returns {Promise<{payoutId: string, status: string}>}
 */
async function requestPayout(input) {
  const db = admin.firestore();
  const { creatorId, ownerUid, amountMinor, payoutAddress, networkFeeMinor = 100 } = input;

  if (creatorId !== ownerUid) {
    throw new HttpsError("permission-denied", "Only creator owner can request payout");
  }

  const MIN_PAYOUT_MINOR = 2000; // $20 minimum
  if (!Number.isInteger(amountMinor) || amountMinor < MIN_PAYOUT_MINOR) {
    throw new HttpsError("invalid-argument", `Minimum payout is $${MIN_PAYOUT_MINOR / 100}`);
  }

  if (!payoutAddress || typeof payoutAddress !== "string" || payoutAddress.trim().length < 10) {
    throw new HttpsError("invalid-argument", "Valid USDT payout address is required");
  }

  // Check 24-hour address freeze
  const settingsRef = db.doc(`creators/${creatorId}/private/settings`);
  const settingsSnap = await settingsRef.get();
  if (settingsSnap.exists) {
    const addressChangedAt = settingsSnap.get("payoutAddressUpdatedAt");
    if (addressChangedAt) {
      const changedTime = addressChangedAt.toDate ? addressChangedAt.toDate().getTime() : new Date(addressChangedAt).getTime();
      const freezePeriod = 24 * 60 * 60 * 1000;
      if (Date.now() - changedTime < freezePeriod) {
        throw new HttpsError("failed-precondition", "Payout address was changed recently. 24-hour security hold applies.");
      }
    }
  }

  const payoutRef = db.collection("payouts").doc();
  const payoutId = payoutRef.id;
  const txId = payoutTxId(payoutId);
  // Fee is set here, never by the client (2% withdrawal fee shown in the app)
  const feeMinor = Math.round(amountMinor * 0.02);
  void networkFeeMinor;

  return db.runTransaction(async (tx) => {
    // creator_balances.availableBalance is the creator's withdrawable money (all sales credit it)
    const balRef = db.doc(`creator_balances/${creatorId}`);
    const balSnap = await tx.get(balRef);
    const totalAvailableMinor = balSnap.exists ? Math.round(Number(balSnap.get("availableBalance") || 0) * 100) : 0;

    if (totalAvailableMinor < amountMinor) {
      throw new HttpsError("failed-precondition", "Insufficient available balance");
    }

    const lines = [
      { account: `creator:${creatorId}:available`, deltaMinor: -amountMinor },
      { account: "payout:pending", deltaMinor: amountMinor },
    ];
    assertBalanced(lines);

    const now = admin.firestore.FieldValue.serverTimestamp();

    tx.set(db.doc(`ledger/${txId}`), {
      type: "payout_request",
      lines,
      idempotencyKey: txId,
      createdAt: now,
    });

    tx.set(
      db.doc(`creatorEarnings/${creatorId}/shards/0`),
      { availableMinor: admin.firestore.FieldValue.increment(-amountMinor) },
      { merge: true }
    );
    tx.set(
      balRef,
      {
        availableBalance: admin.firestore.FieldValue.increment(-amountMinor / 100),
        pendingPayoutBalance: admin.firestore.FieldValue.increment(amountMinor / 100),
        updatedAt: now,
      },
      { merge: true }
    );

    tx.set(payoutRef, {
      creatorId,
      ownerUid,
      amountMinor,
      networkFeeMinor: feeMinor,
      payoutAddress,
      status: "requested",
      createdAt: now,
    });

    return { payoutId, status: "requested" };
  });
}

/**
 * Fan unlocks a paid feed post.
 * Atomic double-entry ledger: debit fan, credit creator net, credit platform fee.
 * Also records to legacy unlocked_content for backward compatibility.
 */
async function unlockPost(input) {
  const db = admin.firestore();
  const { fanUid, postId } = input;

  const unlockRef = db.doc(`unlocks/${postId}_${fanUid}`);
  const legacyUnlockRef = db.doc(`unlocked_content/${fanUid}_${postId}`);
  const postRef = db.doc(`posts/${postId}`);
  const walletRef = db.doc(`wallets/${fanUid}`);

  return db.runTransaction(async (tx) => {
    const [unlockSnap, legacySnap, postSnap, walletSnap] =
      await tx.getAll(unlockRef, legacyUnlockRef, postRef, walletRef);

    if (!postSnap.exists) {
      throw new HttpsError("not-found", "Post not found");
    }

    const postData = postSnap.data() || {};
    const creatorId = postData.userId;
    if (!creatorId) {
      throw new HttpsError("failed-precondition", "Post creator missing");
    }

    if (creatorId === fanUid) {
      return { alreadyUnlocked: true, postId };
    }

    // Idempotency: already unlocked
    if (unlockSnap.exists || legacySnap.exists) {
      return {
        alreadyUnlocked: true,
        postId,
        txId: unlockSnap.exists ? unlockSnap.get("ledgerTxId") : null,
      };
    }

    // Price determination
    let priceMinor = postData.priceMinor;
    if (!Number.isInteger(priceMinor)) {
      const priceNum = Number(postData.price || 0);
      priceMinor = Math.round(priceNum * 100);
    }

    if (!Number.isInteger(priceMinor) || priceMinor <= 0) {
      throw new HttpsError("failed-precondition", "Post is not for sale");
    }

    const split = await resolveSplit(tx, db, creatorId, priceMinor);
    const { feeBps, platformFee, creatorNet, referralFee } = split;

    // Fan balance: user_balances is the single source of truth (wallets only mirrors it).
    // (Reading wallets first could overwrite a newer NGN top-up that only landed in user_balances.)
    void walletSnap;
    const fanBalSnap = await tx.get(db.doc(`user_balances/${fanUid}`));
    const balanceMinor = fanBalSnap.exists ? Math.round(Number(fanBalSnap.get("balance") || 0) * 100) : 0;

    if (balanceMinor < priceMinor) {
      throw new HttpsError("failed-precondition", "INSUFFICIENT_FUNDS");
    }

    // Double-entry ledger invariant
    const txId = unlockPostTxId(postId, fanUid);
    const now = admin.firestore.FieldValue.serverTimestamp();
    const ledgerLines = [
      { account: `fan:${fanUid}`, deltaMinor: -priceMinor },
      { account: `creator:${creatorId}:available`, deltaMinor: creatorNet },
      { account: "platform:revenue", deltaMinor: platformFee },
    ];
    if (referralFee > 0) ledgerLines.push({ account: `ambassador:${split.referrerId}`, deltaMinor: referralFee });
    assertBalanced(ledgerLines);

    tx.set(db.doc(`ledger/${txId}`), {
      type: "unlock_post",
      fanId: fanUid,
      creatorId,
      postId,
      grossMinor: priceMinor,
      creatorNetMinor: creatorNet,
      platformFeeMinor: platformFee,
      referralFeeMinor: referralFee,
      lines: ledgerLines,
      createdAt: now,
    });
    writeReferral(tx, db, split, { creatorId, source: "post_unlock", ledgerTxId: txId, now });

    const shard = Math.floor(Math.random() * EARNINGS_SHARDS);
    tx.set(
      walletRef,
      {
        balanceMinor: balanceMinor - priceMinor,
        updatedAt: now,
      },
      { merge: true }
    );

    tx.set(
      db.doc(`user_balances/${fanUid}`),
      { balance: (balanceMinor - priceMinor) / 100, updatedAt: now },
      { merge: true }
    );

    tx.set(
      db.doc(`creatorEarnings/${creatorId}/shards/${shard}`),
      { availableMinor: admin.firestore.FieldValue.increment(creatorNet) },
      { merge: true }
    );

    tx.set(
      db.doc(`creator_balances/${creatorId}`),
      {
        availableBalance: admin.firestore.FieldValue.increment(creatorNet / 100),
        totalEarnings: admin.firestore.FieldValue.increment(creatorNet / 100),
        updatedAt: now,
      },
      { merge: true }
    );

    tx.set(db.doc(`purchases/${txId}`), {
      creatorId,
      fanId: fanUid,
      postId,
      grossMinor: priceMinor,
      feeBps,
      platformFeeMinor: platformFee,
      referralFeeMinor: referralFee,
      creatorNetMinor: creatorNet,
      createdAt: now,
    });

    tx.set(
      db.doc(`creators/${creatorId}/fans/${fanUid}`),
      {
        lifetimeSpendMinor: admin.firestore.FieldValue.increment(priceMinor),
        lastPurchaseAt: now,
      },
      { merge: true }
    );

    tx.set(unlockRef, {
      fanId: fanUid,
      creatorId,
      postId,
      ledgerTxId: txId,
      createdAt: now,
    });

    tx.set(legacyUnlockRef, {
      userId: fanUid,
      postId,
      creatorId,
      price: priceMinor / 100,
      unlockedAt: now,
    });

    return { alreadyUnlocked: false, postId, txId };
  });
}

/**
 * Credit a creator for a sale that was paid directly with crypto (webhook path).
 * Same split model as wallet purchases. Idempotent per payment id.
 */
async function creditDirectSale({ paymentId, creatorId, fanUid, grossMinor, source }) {
  const db = admin.firestore();
  if (!creatorId || !Number.isInteger(grossMinor) || grossMinor <= 0) return { credited: false };
  const txId = `sale_${paymentId}`;
  const ledgerRef = db.doc(`ledger/${txId}`);

  return db.runTransaction(async (tx) => {
    const existing = await tx.get(ledgerRef);
    if (existing.exists) return { credited: false };
    const split = await resolveSplit(tx, db, creatorId, grossMinor);
    const { platformFee, creatorNet, referralFee } = split;
    const lines = [
      { account: "external:crypto", deltaMinor: -grossMinor },
      { account: `creator:${creatorId}:available`, deltaMinor: creatorNet },
      { account: "platform:revenue", deltaMinor: platformFee },
    ];
    if (referralFee > 0) lines.push({ account: `ambassador:${split.referrerId}`, deltaMinor: referralFee });
    assertBalanced(lines);

    const now = admin.firestore.FieldValue.serverTimestamp();
    const shard = Math.floor(Math.random() * EARNINGS_SHARDS);
    tx.set(ledgerRef, { type: `direct_${source}`, fanId: fanUid, creatorId, lines, idempotencyKey: txId, createdAt: now });
    tx.set(db.doc(`creatorEarnings/${creatorId}/shards/${shard}`),
      { availableMinor: admin.firestore.FieldValue.increment(creatorNet) }, { merge: true });
    // Earnings are instant (crypto) — straight to available, never pending
    tx.set(db.doc(`creator_balances/${creatorId}`), {
      creatorId,
      availableBalance: admin.firestore.FieldValue.increment(creatorNet / 100),
      totalEarnings: admin.firestore.FieldValue.increment(creatorNet / 100),
      updatedAt: now,
    }, { merge: true });
    writeReferral(tx, db, split, { creatorId, source, ledgerTxId: txId, now });
    return { credited: true, creatorNet, platformFee, referralFee };
  });
}

module.exports = {
  resolveSplit,
  writeReferral,
  creditDirectSale,
  unlockMessage,
  unlockPost,
  creditTopup,
  requestPayout,
};
