// functions/src/ledger-math.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  splitFee,
  splitWithReferral,
  assertBalanced,
  unlockTxId,
  topupTxId,
  STANDARD_FEE_BPS,
  AMBASSADOR_FEE_BPS,
} = require("./ledger-math");

test("standard 20% fee on $10 (1000 minor)", () => {
  assert.deepEqual(splitFee(1000, STANDARD_FEE_BPS), {
    platformFee: 200,
    creatorNet: 800,
  });
});

test("ambassador 10% fee on $4.50 (450 minor)", () => {
  assert.deepEqual(splitFee(450, AMBASSADOR_FEE_BPS), {
    platformFee: 45,
    creatorNet: 405,
  });
});

test("rounding: platform fee floors, creator gets the remainder", () => {
  assert.deepEqual(splitFee(333, STANDARD_FEE_BPS), {
    platformFee: 66,
    creatorNet: 267,
  });
});

test("fee + net always equals gross", () => {
  for (const bps of [0, 1000, 2000, 10000]) {
    for (let g = 1; g <= 5000; g++) {
      const { platformFee, creatorNet } = splitFee(g, bps);
      assert.equal(platformFee + creatorNet, g);
      assert.ok(platformFee >= 0 && creatorNet >= 0);
    }
  }
});

test("rejects bad input", () => {
  assert.throws(() => splitFee(0, 2000));
  assert.throws(() => splitFee(-5, 2000));
  assert.throws(() => splitFee(10.5, 2000));
  assert.throws(() => splitFee(100, 10001));
  assert.throws(() => splitFee(100, 20.5));
});

test("assertBalanced", () => {
  assertBalanced([
    { account: "a", deltaMinor: -100 },
    { account: "b", deltaMinor: 80 },
    { account: "c", deltaMinor: 20 },
  ]);
  assert.throws(() =>
    assertBalanced([
      { account: "a", deltaMinor: -100 },
      { account: "b", deltaMinor: 80 },
    ])
  );
  assert.throws(() =>
    assertBalanced([
      { account: "a", deltaMinor: -1.5 },
      { account: "b", deltaMinor: 1.5 },
    ])
  );
});

test("transaction ids are deterministic", () => {
  assert.equal(unlockTxId("m1", "u1"), unlockTxId("m1", "u1"));
  assert.notEqual(unlockTxId("m1", "u1"), unlockTxId("m1", "u2"));
  assert.equal(topupTxId("p1"), "topup_p1");
});

test("normal creator, no referral: 80 / 20", () => {
  const r = splitWithReferral(1000, {});
  assert.equal(r.creatorNet, 800);
  assert.equal(r.platformFee, 200);
  assert.equal(r.referralFee, 0);
});

test("referred normal creator: 80 / 5 ambassador / 15 platform", () => {
  const r = splitWithReferral(1000, { referrerId: "amb1" });
  assert.equal(r.creatorNet, 800);
  assert.equal(r.referralFee, 50);
  assert.equal(r.platformFee, 150);
  assert.equal(r.referrerId, "amb1");
});

test("ambassador creator: 90 / 10, never pays referral", () => {
  const r = splitWithReferral(1000, { isAmbassador: true, referrerId: "amb1" });
  assert.equal(r.creatorNet, 900);
  assert.equal(r.platformFee, 100);
  assert.equal(r.referralFee, 0);
});

test("split always sums to gross", () => {
  for (const g of [1, 7, 99, 333, 1001, 123457]) {
    const r = splitWithReferral(g, { referrerId: "x" });
    assert.equal(r.creatorNet + r.platformFee + r.referralFee, g);
  }
});
