// functions/src/ledger-math.js
// Pure money helpers. All amounts are integer minor units (cents).
// 1 credit = $1 = 100 minor units.

const STANDARD_FEE_BPS = 2000; // creator keeps 80% (platform fee 20%)
const AMBASSADOR_FEE_BPS = 1000; // creator keeps 90% (platform fee 10%)

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
  splitFee,
  assertBalanced,
  unlockTxId,
  unlockPostTxId,
  topupTxId,
  payoutTxId,
};
