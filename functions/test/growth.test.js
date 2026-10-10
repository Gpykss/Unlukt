// functions/test/growth.test.js — ?src= source report and the first-50 Ambassador rule
const test = require("node:test");
const assert = require("node:assert/strict");
const { installMock, Timestamp } = require("./mockFirestore");
const db = installMock();
const { sourceStats, cleanSource, NO_SOURCE } = require("../src/sources");
const { grantFoundingAmbassador, FOUNDING_AMBASSADOR_LIMIT, COUNTER_PATH } = require("../src/ambassador");
const { splitWithReferral } = require("../src/ledger-math");

const daysAgo = (n) => Timestamp.fromMillis(Date.now() - n * 24 * 60 * 60 * 1000);

test("cleanSource: simple names only", () => {
  assert.equal(cleanSource(" Reddit "), "reddit");
  assert.equal(cleanSource("snap_ad-2"), "snap_ad-2");
  assert.equal(cleanSource("<script>"), null);
  assert.equal(cleanSource("a".repeat(41)), null);
  assert.equal(cleanSource(""), null);
  assert.equal(cleanSource(undefined), null);
});

test("sourceStats: sign-ups, funded wallets and paying fans per source", async () => {
  db.store.clear();
  db.seed("users/r1", { signupSource: "reddit", createdAt: daysAgo(1) });
  db.seed("users/r2", { signupSource: "Reddit", createdAt: daysAgo(2) });   // counted with reddit
  db.seed("users/r3", { signupSource: "reddit", createdAt: daysAgo(40) });
  db.seed("users/s1", { signupSource: "snapchat", createdAt: daysAgo(3) });
  db.seed("users/d1", { createdAt: daysAgo(3) });                           // no link
  db.seed("users/bad", { signupSource: "<b>", createdAt: daysAgo(3) });     // junk → no source
  // top-ups: r1 twice (still one funded wallet), r3 once, d1 once; a debit is not a top-up
  db.seed("transactions/t1", { userId: "r1", type: "topup", amount: 10 });
  db.seed("transactions/t2", { userId: "r1", type: "topup", amount: 5 });
  db.seed("transactions/t3", { userId: "r3", type: "topup", amount: 5 });
  db.seed("transactions/t4", { userId: "d1", type: "topup", amount: 5 });
  db.seed("transactions/t5", { userId: "s1", type: "debit", amount: -5 });
  // purchases: r1 bought twice, d1 once
  db.seed("purchases/p1", { fanId: "r1", creatorId: "c", type: "tip" });
  db.seed("purchases/p2", { fanId: "r1", creatorId: "c", type: "subscription" });
  db.seed("purchases/p3", { fanId: "d1", creatorId: "c", type: "tip" });

  const all = await sourceStats(db);
  assert.deepEqual(all.rows, [
    { source: "reddit", signups: 3, funded: 2, paying: 1 },
    { source: "snapchat", signups: 1, funded: 0, paying: 0 },
    { source: NO_SOURCE, signups: 2, funded: 1, paying: 1 },
  ]);
  assert.deepEqual(all.totals, { signups: 6, funded: 3, paying: 2 });

  // last 30 days: the 40-day-old reddit sign-up (and its top-up) drops out
  const recent = await sourceStats(db, { sinceDays: 30 });
  assert.deepEqual(recent.rows[0], { source: "reddit", signups: 2, funded: 1, paying: 1 });
  assert.equal(recent.totals.signups, 5);
});

test("first 50 approved creators become Ambassadors, the 51st does not", async () => {
  db.store.clear();
  db.seed("users/pending", { role: "creator", kycStatus: "pending" });
  assert.deepEqual(await grantFoundingAmbassador(db, "pending"), { granted: false, reason: "not-approved" });
  assert.equal((await grantFoundingAmbassador(db, "ghost")).reason, "no-user");

  for (let i = 1; i <= FOUNDING_AMBASSADOR_LIMIT; i += 1) {
    db.seed(`users/c${i}`, { role: "creator", kycStatus: "approved" });
    assert.deepEqual(await grantFoundingAmbassador(db, `c${i}`), { granted: true, number: i });
  }
  assert.equal(db.data("users/c1").isAmbassador, true);
  assert.equal(db.data("users/c50").ambassadorNumber, 50);
  assert.equal(db.data(COUNTER_PATH).count, 50);

  db.seed("users/c51", { role: "creator", kycStatus: "approved" });
  assert.deepEqual(await grantFoundingAmbassador(db, "c51"), { granted: false, reason: "full" });
  assert.notEqual(db.data("users/c51").isAmbassador, true);
  assert.equal(db.data(COUNTER_PATH).count, 50);
});

test("a place is taken once: repeats, existing ambassadors and removed ones don't use another", async () => {
  db.store.clear();
  db.seed("users/a", { role: "creator", kycStatus: "approved" });
  assert.equal((await grantFoundingAmbassador(db, "a")).number, 1);
  assert.equal((await grantFoundingAmbassador(db, "a")).reason, "already");
  db.seed("users/ref", { role: "ambassador", kycStatus: "approved" });
  assert.equal((await grantFoundingAmbassador(db, "ref")).reason, "already");
  // admin took the status away → re-approval does not hand it back
  db.seed("users/a", { ...db.data("users/a"), isAmbassador: false });
  assert.equal((await grantFoundingAmbassador(db, "a")).reason, "already");
  assert.equal(db.data(COUNTER_PATH).count, 1);
});

test("the split behind the copy: Ambassadors keep 90%, Creators keep 80%", () => {
  assert.equal(splitWithReferral(10000, { isAmbassador: true }).creatorNet, 9000);
  assert.equal(splitWithReferral(10000, { isAmbassador: false }).creatorNet, 8000);
});
