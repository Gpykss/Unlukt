// functions/src/ledger.js
const admin = require("firebase-admin");
const { HttpsError } = require("firebase-functions/v2/https");
const {
  STANDARD_FEE_BPS,
  AMBASSADOR_FEE_BPS,
  splitFee,
  assertBalanced,
  unlockTxId,
  unlockPostTxId,
  topupTxId,
  payoutTxId,
} = require("./ledger-math");

const EARNINGS_SHARDS = 10; // sharded counters to avoid hot-spotting a single document

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

    // Determine price in minor units (cents)
    let priceMinor = msgSnap.get("priceMinor");
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

    const creatorId = convData.creatorId || msgSnap.get("senderId");
    if (!creatorId) {
      throw new HttpsError("failed-precondition", "Creator not found for conversation");
    }

    // Check creator fee settings
    const settingsSnap = await tx.get(
      db.doc(`creators/${creatorId}/private/settings`)
    );
    let feeBps = settingsSnap.exists ? settingsSnap.get("feeBps") : null;
    if (!Number.isInteger(feeBps)) {
      // Check if creator is ambassador
      const creatorUserSnap = await tx.get(db.doc(`users/${creatorId}`));
      const isAmbassador = creatorUserSnap.exists && (creatorUserSnap.get("isAmbassador") || creatorUserSnap.get("role") === "ambassador");
      feeBps = isAmbassador ? AMBASSADOR_FEE_BPS : STANDARD_FEE_BPS;
    }

    // Check fan balance
    let balanceMinor = walletSnap.exists ? walletSnap.get("balanceMinor") : null;
    if (!Number.isInteger(balanceMinor)) {
      // Backward compatibility check with legacy user_balances
      const legacySnap = await tx.get(db.doc(`user_balances/${fanUid}`));
      if (legacySnap.exists) {
        balanceMinor = Math.round((legacySnap.get("balance") || 0) * 100);
      } else {
        balanceMinor = 0;
      }
    }

    if (balanceMinor < priceMinor) {
      throw new HttpsError("failed-precondition", "Insufficient credits");
    }

    const { platformFee, creatorNet } = splitFee(priceMinor, feeBps);
    const txId = unlockTxId(messageId, fanUid);

    const lines = [
      { account: `fan:${fanUid}`, deltaMinor: -priceMinor },
      { account: `creator:${creatorId}:available`, deltaMinor: creatorNet },
      { account: "platform:revenue", deltaMinor: platformFee },
    ];
    assertBalanced(lines);

    const now = admin.firestore.FieldValue.serverTimestamp();
    const shard = Math.floor(Math.random() * EARNINGS_SHARDS);

    // 2. All writes
    tx.set(db.doc(`ledger/${txId}`), {
      type: "unlock",
      lines,
      idempotencyKey: txId,
      createdAt: now,
    });

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

  return db.runTransaction(async (tx) => {
    // Sum shards to get available balance
    let totalAvailableMinor = 0;
    const shardRefs = [];
    for (let i = 0; i < EARNINGS_SHARDS; i++) {
      shardRefs.push(db.doc(`creatorEarnings/${creatorId}/shards/${i}`));
    }
    const shardSnaps = await tx.getAll(...shardRefs);
    let anyShardExists = false;
    for (const snap of shardSnaps) {
      if (snap.exists) {
        anyShardExists = true;
        totalAvailableMinor += (snap.get("availableMinor") || 0);
      }
    }

    // Fallback to legacy creator_balances if shards not yet populated
    if (!anyShardExists) {
      const legSnap = await tx.get(db.doc(`creator_balances/${creatorId}`));
      if (legSnap.exists) {
        totalAvailableMinor = Math.round((legSnap.get("availableBalance") || 0) * 100);
      }
    }

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

    // Debit one of the shards
    const primaryShard = db.doc(`creatorEarnings/${creatorId}/shards/0`);
    tx.set(
      primaryShard,
      { availableMinor: admin.firestore.FieldValue.increment(-amountMinor) },
      { merge: true }
    );

    // Keep legacy creator_balances in sync
    tx.set(
      db.doc(`creator_balances/${creatorId}`),
      {
        availableBalance: admin.firestore.FieldValue.increment(-amountMinor / 100),
        updatedAt: now,
      },
      { merge: true }
    );

    tx.set(payoutRef, {
      creatorId,
      ownerUid,
      amountMinor,
      networkFeeMinor,
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

    // Creator fee calculation
    const settingsSnap = await tx.get(
      db.doc(`creators/${creatorId}/private/settings`)
    );
    let feeBps = settingsSnap.exists ? settingsSnap.get("feeBps") : null;
    if (!Number.isInteger(feeBps)) {
      const creatorUserSnap = await tx.get(db.doc(`users/${creatorId}`));
      const isAmbassador =
        creatorUserSnap.exists &&
        creatorUserSnap.get("isAmbassador") === true;
      feeBps = isAmbassador ? AMBASSADOR_FEE_BPS : STANDARD_FEE_BPS;
    }

    const { platformFee, creatorNet } = splitFee(priceMinor, feeBps);

    // Fan wallet check
    let balanceMinor = walletSnap.exists ? walletSnap.get("balanceMinor") : null;
    if (!Number.isInteger(balanceMinor)) {
      const legacyBalSnap = await tx.get(db.doc(`user_balances/${fanUid}`));
      const legacyBal = legacyBalSnap.exists ? Number(legacyBalSnap.get("balance") || 0) : 0;
      balanceMinor = Math.round(legacyBal * 100);
    }

    if (balanceMinor < priceMinor) {
      throw new HttpsError("failed-precondition", "INSUFFICIENT_FUNDS");
    }

    // Double-entry ledger invariant
    const txId = unlockPostTxId(postId, fanUid);
    const now = admin.firestore.FieldValue.serverTimestamp();
    const ledgerLines = [
      { account: `fan:${fanUid}`, deltaMinor: -priceMinor },
      { account: `creator:${creatorId}`, deltaMinor: creatorNet },
      { account: "platform:fees", deltaMinor: platformFee },
    ];
    assertBalanced(ledgerLines);

    tx.set(db.doc(`ledger/${txId}`), {
      type: "unlock_post",
      fanId: fanUid,
      creatorId,
      postId,
      grossMinor: priceMinor,
      creatorNetMinor: creatorNet,
      platformFeeMinor: platformFee,
      lines: ledgerLines,
      createdAt: now,
    });

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

module.exports = {
  unlockMessage,
  unlockPost,
  creditTopup,
  requestPayout,
};
