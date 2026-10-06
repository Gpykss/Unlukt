// functions/src/ledger-math.js
// Pure money helpers. All amounts are integer minor units (cents).
// 1 credit = $1 = 100 minor units.

const STANDARD_FEE_BPS = 2000; // creator keeps 80% (platform fee 20%)
const AMBASSADOR_FEE_BPS = 1000; // creator keeps 90% (platform fee 10%)
const REFERRAL_BPS = 500; // referring ambassador gets 5% of a normal creator's gross (paid out of the 20% platform fee)
const REFERRAL_WINDOW_MS = 365 * 24 * 60 * 60 * 1000; // referral commission lasts 1 year from creator signup

/**
 * Split a gross minor amount into platform fee and creator net based on basis points.
 * Rule: platform fee floors, creator gets the remainder (fee + net === gross).
 */
function splitFee(grossMinor, feeBps) {
  if (!Number.isInteger(grossMinor) || grossMinor <= 0) {
    throw new Error(`Invalid gross amount: ${grossMinor}`);
  }
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10000) {
    throw new Error(`Invalid feeBps: ${feeBps}`);
  }
  const platformFee = Math.floor((grossMinor * feeBps) / 10000);
  return { platformFee, creatorNet: grossMinor - platformFee };
}

/**
 * Full revenue split for one sale.
 *   Ambassador creator              -> 90% creator | 10% platform
 *   Normal creator, referred (1 yr) -> 80% creator |  5% referring ambassador | 15% platform
 *   Normal creator                  -> 80% creator | 20% platform
 * fee + referral + net === gross, always.
 */
function splitWithReferral(grossMinor, { isAmbassador = false, referrerId = null } = {}) {
  const feeBps = isAmbassador ? AMBASSADOR_FEE_BPS : STANDARD_FEE_BPS;
  const { platformFee: totalFee, creatorNet } = splitFee(grossMinor, feeBps);
  let referralFee = 0;
  if (!isAmbassador && referrerId) {
    referralFee = Math.min(totalFee, Math.floor((grossMinor * REFERRAL_BPS) / 10000));
  }
  return {
    feeBps,
    creatorNet,
    referralFee,
    platformFee: totalFee - referralFee,
    referrerId: referralFee > 0 ? referrerId : null,
  };
}

/**
 * Asserts that all lines in a ledger transaction sum exactly to zero
 * and that all amounts are integers.
 */
function assertBalanced(lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error("Ledger transaction must have at least one line");
  }
  let sum = 0;
  for (const l of lines) {
    if (!Number.isInteger(l.deltaMinor)) {
      throw new Error(`Non-integer ledger amount on ${l.account}`);
    }
    sum += l.deltaMinor;
  }
  if (sum !== 0) {
    throw new Error(`Unbalanced ledger transaction: sum is ${sum}`);
  }
}

// Deterministic IDs ensure retries and double taps are idempotent
const unlockTxId = (messageId, fanUid) => `unlock_${messageId}_${fanUid}`;
const unlockPostTxId = (postId, fanUid) => `unlock_post_${postId}_${fanUid}`;
const topupTxId = (providerPaymentId) => `topup_${providerPaymentId}`;
const payoutTxId = (payoutId) => `payout_${payoutId}`;

module.exports = {
  STANDARD_FEE_BPS,
  AMBASSADOR_FEE_BPS,
  REFERRAL_BPS,
  REFERRAL_WINDOW_MS,
  splitFee,
  splitWithReferral,
  assertBalanced,
  unlockTxId,
  unlockPostTxId,
  topupTxId,
  payoutTxId,
};
