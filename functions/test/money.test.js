// functions/test/money.test.js — run: node --test test/
const test = require("node:test");
const assert = require("node:assert/strict");
const { installMock, Timestamp } = require("./mockFirestore");

const db = installMock();
const m = require("../src/money");
const ledger = require("../src/ledger");

const bal = (uid) => db.data(`user_balances/${uid}`)?.balance;
const earn = (uid) => db.data(`creator_balances/${uid}`)?.availableBalance || 0;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
let n = 0;
const rid = () => `req-${Date.now()}-${++n}-abcdefgh`;

function reset() {
  db.store.clear();
  db.seed("users/fan", { username: "fan", displayName: "Fan" });
  db.seed("users/creator", { username: "cre", displayName: "Creator", createdAt: Timestamp.fromMillis(Date.now()) });
  db.seed("users/ambCreator", { username: "ac", role: "ambassador" });
  db.seed("users/amb", { username: "amb", role: "ambassador", ambassadorBalance: 0 });
  db.seed("users/referred", { username: "ref", referredBy: "amb", createdAt: Timestamp.fromMillis(Date.now() - 1000) });
  db.seed("users/notAmbRef", { username: "x", referredBy: "fan", createdAt: Timestamp.fromMillis(Date.now()) });
  db.seed("user_balances/fan", { balance: 100 });
  db.seed("wallets/fan", { balanceMinor: 1 }); // stale mirror must NOT be trusted
}

test("tip: 80/20 split, fan debited, idempotent on retry", async () => {
  reset();
  const id = rid();
  const r1 = await m.tip(db, "fan", { creatorId: "creator", amount: 10, requestId: id });
  near(bal("fan"), 90);
  near(earn("creator"), 8);
  assert.equal(db.data("wallets/fan").balanceMinor, 9000);
  const r2 = await m.tip(db, "fan", { creatorId: "creator", amount: 10, requestId: id });
  assert.equal(r2.duplicate, true);
  near(bal("fan"), 90); // charged once
  assert.equal(r1.tipId, r2.tipId);
  assert.ok(db.data(`tips/${r1.tipId}`));
});

test("tip: ambassador creator gets 90%", async () => {
  reset();
  await m.tip(db, "fan", { creatorId: "ambCreator", amount: 10, requestId: rid() });
  near(earn("ambCreator"), 9);
});

test("tip: referred creator 80% + ambassador 5%", async () => {
  reset();
  await m.tip(db, "fan", { creatorId: "referred", amount: 20, requestId: rid() });
  near(earn("referred"), 16);
  near(db.data("users/amb").ambassadorBalance, 1);
});

test("tip: referral to a non-ambassador pays nobody", async () => {
  reset();
  await m.tip(db, "fan", { creatorId: "notAmbRef", amount: 10, requestId: rid() });
  near(earn("notAmbRef"), 8);
  assert.equal(db.data("users/fan").ambassadorBalance, undefined);
});

test("tip: negative / tiny / huge / NaN amounts rejected; insufficient balance rejected, nothing written", async () => {
  reset();
  for (const amount of [-50, 0, 0.5, "abc", 20000]) {
    await assert.rejects(m.tip(db, "fan", { creatorId: "creator", amount, requestId: rid() }));
  }
  await assert.rejects(m.tip(db, "fan", { creatorId: "creator", amount: 500, requestId: rid() }), /Insufficient/);
  near(bal("fan"), 100);
  assert.equal(earn("creator"), 0);
  await assert.rejects(m.tip(db, "fan", { creatorId: "fan", amount: 5, requestId: rid() }));
});

test("call: server price, tier discount, one open booking, refund reverses everything", async () => {
  reset();
  db.seed("creator_availability/creator", { videoCallPrice: 20, callsEnabled: true });
  db.seed("subscriptions/fan_creator", { status: "active", tier: "vip", expiresAt: Timestamp.fromMillis(Date.now() + 864e5) });
  const at = Date.now() + 10 * 60000;
  const r = await m.bookCall(db, "fan", { creatorId: "creator", callType: "video", duration: 60, scheduledAt: at, requestId: rid() });
  near(r.price, 36); // 20 per 30 min × 2 = 40, VIP −10%
  near(bal("fan"), 64);
  near(earn("creator"), 28.8);
  const b = db.data(`call_bookings/${r.bookingId}`);
  assert.equal(b.status, "confirmed");
  assert.equal(b.creatorPaid, true);

  // second booking with the same creator is refused
  db.seed("user_balances/fan2", { balance: 100 });
  await assert.rejects(m.bookCall(db, "fan2", { creatorId: "creator", callType: "video", duration: 30, scheduledAt: at, requestId: rid() }), /already has a call/);

  // creator rejects → fan back to 100, creator back to 0
  const out = await m.refundCall(db, "creator", { bookingId: r.bookingId, reason: "busy" });
  assert.equal(out.status, "rejected");
  near(bal("fan"), 100);
  near(earn("creator"), 0);
  // refunding twice is refused
  await assert.rejects(m.refundCall(db, "fan", { bookingId: r.bookingId }));
  near(bal("fan"), 100);
});

test("call: price check, too-soon time, stranger refund", async () => {
  reset();
  const at = Date.now() + 10 * 60000;
  await assert.rejects(m.bookCall(db, "fan", { creatorId: "creator", callType: "voice", duration: 30, scheduledAt: Date.now(), requestId: rid() }), /2 minutes/);
  await assert.rejects(m.bookCall(db, "fan", { creatorId: "creator", callType: "voice", duration: 45, scheduledAt: at, requestId: rid() }), /length/);
  await assert.rejects(m.bookCall(db, "fan", { creatorId: "creator", callType: "voice", duration: 30, scheduledAt: at, expectedPrice: 1, requestId: rid() }), /price changed/);
  const r = await m.bookCall(db, "fan", { creatorId: "creator", callType: "voice", duration: 30, scheduledAt: at, requestId: rid() });
  near(r.price, 3);
  await assert.rejects(m.refundCall(db, "amb", { bookingId: r.bookingId }), /not part/);
  const out = await m.refundCall(db, "fan", { bookingId: r.bookingId });
  assert.equal(out.status, "cancelled");
});

test("call: legacy booking (no ledger) refund uses saved price/earning", async () => {
  reset();
  db.seed("call_bookings/old", {
    userId: "fan", creatorId: "creator", price: 10, creatorEarning: 8, status: "confirmed", duration: 30,
    scheduledAt: Timestamp.fromMillis(Date.now() + 3600e3), creatorPaid: true,
  });
  db.seed("creator_balances/creator", { availableBalance: 8 });
  // could have been forged under the old rules → no automatic refund
  await assert.rejects(m.refundCall(db, "fan", { bookingId: "old" }), /support/);
  near(bal("fan"), 100);
  // after an admin verifies it, it refunds from the saved price/earning
  db.seed("call_bookings/old", { ...db.data("call_bookings/old"), legacyVerified: true });
  await m.refundCall(db, "fan", { bookingId: "old" });
  near(bal("fan"), 110);
  near(earn("creator"), 0);
});

test("subscription: server price, extends, counts subscriber once", async () => {
  reset();
  db.seed("creator_tiers/creator", { vip: { price: 25 } });
  const r = await m.subscribe(db, "fan", { creatorId: "creator", tier: "vip", duration: "monthly", requestId: rid() });
  near(r.price, 25);
  near(bal("fan"), 75);
  assert.equal(db.data("users/creator").subscribersCount, 1);
  const r2 = await m.subscribe(db, "fan", { creatorId: "creator", tier: "vip", duration: "monthly", requestId: rid() });
  assert.ok(r2.expiresAt > r.expiresAt + 29 * 864e5);
  assert.equal(db.data("users/creator").subscribersCount, 1);
  await assert.rejects(m.subscribe(db, "fan", { creatorId: "creator", tier: "vip", duration: "weekly", requestId: rid() }));
  await assert.rejects(m.subscribe(db, "fan", { creatorId: "creator", tier: "supporter", duration: "daily", requestId: rid() }), /duration/);
});

test("subscription: creator discount applies", async () => {
  reset();
  db.seed("creator_discounts/creator", { limited_time: { active: true, percent: 50, expiresAt: new Date(Date.now() + 864e5).toISOString() } });
  const r = await m.subscribe(db, "fan", { creatorId: "creator", tier: "supporter", duration: "monthly", requestId: rid() });
  near(r.price, 5); // 9.99 × 50% = 4.995 → 5.00
});

test("community: paid join charges once, free join costs nothing", async () => {
  reset();
  db.seed("communities/c1", { creatorId: "creator", name: "C1", price: 12, isPrivate: true });
  db.seed("communities/c2", { creatorId: "creator", name: "Free", isPrivate: false });
  await m.joinCommunity(db, "fan", { communityId: "c1", joinType: "monthly", requestId: rid() });
  near(bal("fan"), 88);
  near(earn("creator"), 9.6);
  const again = await m.joinCommunity(db, "fan", { communityId: "c1", joinType: "monthly", requestId: rid() });
  assert.equal(again.alreadyMember, true);
  near(bal("fan"), 88);
  await m.joinCommunity(db, "fan", { communityId: "c2", requestId: rid() });
  near(bal("fan"), 88);
  assert.equal(db.data("community_members/fan_c2").subscriptionStatus, "active");
  assert.equal(db.data("communities/c1").memberCount, 1);
});

test("live: prices from creator settings, decline refunds", async () => {
  reset();
  db.seed("users/creator", { username: "cre", is_live: true });
  db.seed("livestream_rooms/creator", { settings: { questionPrice: 3, guestPrice: 0, requestMenu: [{ label: "Shoutout", price: 5 }], customRequestMin: 7 } });
  const q = await m.livePay(db, "fan", { creatorId: "creator", action: "question", text: "hi?", requestId: rid() });
  near(bal("fan"), 97);
  const r = await m.livePay(db, "fan", { creatorId: "creator", action: "request", label: "Shoutout", amount: 1, requestId: rid() });
  near(r.amount, 5); // menu price, not the client's 1
  await assert.rejects(m.livePay(db, "fan", { creatorId: "creator", action: "request", label: "x", amount: 3, requestId: rid() }), /start at 7/);
  const g = await m.livePay(db, "fan", { creatorId: "creator", action: "guest", requestId: rid() });
  assert.equal(g.amount, 0); // free guest request: no charge, message still created
  assert.equal(db.data(`livestream_rooms/creator/messages/${g.messageId}`).type, "stage_request");
  near(bal("fan"), 92);
  await m.liveDecline(db, "creator", { messageId: q.messageId });
  near(bal("fan"), 95);
  assert.equal(db.data(`livestream_rooms/creator/messages/${q.messageId}`).status, "declined");
  await m.liveDecline(db, "creator", { messageId: q.messageId }); // second decline = no double refund
  near(bal("fan"), 95);
  db.seed("users/creator", { username: "cre", is_live: false });
  await assert.rejects(m.livePay(db, "fan", { creatorId: "creator", action: "tip", amount: 5, requestId: rid() }), /isn't live/);
});

test("live ticket: charged once per hour", async () => {
  reset();
  db.seed("users/creator", { username: "cre", livestreamPrice: 4 });
  await m.buyLiveTicket(db, "fan", "creator");
  await m.buyLiveTicket(db, "fan", "creator");
  near(bal("fan"), 96);
  near(earn("creator"), 3.2);
});

test("post unlock uses user_balances, not the stale wallets mirror", async () => {
  reset();
  db.seed("posts/p1", { userId: "creator", price: 7 });
  await ledger.unlockPost({ fanUid: "fan", postId: "p1" });
  near(bal("fan"), 93);
  near(earn("creator"), 5.6);
  const again = await ledger.unlockPost({ fanUid: "fan", postId: "p1" });
  assert.equal(again.alreadyUnlocked, true);
  near(bal("fan"), 93);
});

test("payout: only real creator_balances, fee set by server", async () => {
  reset();
  db.seed("creator_balances/creator", { availableBalance: 50 });
  await assert.rejects(ledger.requestPayout({ creatorId: "creator", ownerUid: "creator", amountMinor: 6000, payoutAddress: "TXYZabcdefghijk", networkFeeMinor: 0 }), /Insufficient/);
  const r = await ledger.requestPayout({ creatorId: "creator", ownerUid: "creator", amountMinor: 3000, payoutAddress: "TXYZabcdefghijk", networkFeeMinor: 0 });
  near(earn("creator"), 20);
  assert.equal(db.data(`payouts/${r.payoutId}`).networkFeeMinor, 60);
});

test("ambassador claim moves commission once", async () => {
  reset();
  db.seed("users/amb", { role: "ambassador", ambassadorBalance: 12.5 });
  await m.claimAmbassador(db, "amb");
  await m.claimAmbassador(db, "amb");
  near(earn("amb"), 12.5);
  assert.equal(db.data("users/amb").ambassadorBalance, 0);
});

test("money is conserved across a mix of actions", async () => {
  reset();
  db.seed("users/creator", { username: "cre", is_live: true });
  db.seed("livestream_rooms/creator", { settings: {} });
  await m.tip(db, "fan", { creatorId: "referred", amount: 10, requestId: rid() });
  await m.livePay(db, "fan", { creatorId: "creator", action: "tip", amount: 5, requestId: rid() });
  const fanSpent = 100 - bal("fan");
  const creators = earn("referred") + earn("creator");
  const amb = db.data("users/amb").ambassadorBalance || 0;
  const platform = db.list("ledger/").map((p) => db.data(p))
    .flatMap((l) => l.lines || []).filter((x) => x.account === "platform:revenue").reduce((a, x) => a + x.deltaMinor, 0) / 100;
  near(fanSpent, creators + amb + platform);
});

test("admin NGN approval: recomputes dollars, credits once", async () => {
  reset();
  db.seed("settings/ngn_rate", { rate: 1500, buffer: 0 });
  // buyer's browser claimed $1000 for ₦15,150 (real value ≈ $10)
  db.seed("ngn_payments/p1", { userId: "fan", amountNGN: 15150, amountUSD: 1000, status: "pending" });
  const r = await m.adminTopup(db, "admin", { kind: "ngn", paymentId: "p1" });
  near(r.credited, 10.2); // 15150 / 1515 = 10 → +2% tolerance cap
  near(bal("fan"), 110.2);
  await assert.rejects(m.adminTopup(db, "admin", { kind: "ngn", paymentId: "p1" }), /Already/);
  near(bal("fan"), 110.2);
  db.seed("ngn_payments/p2", { userId: "fan", amountNGN: 15150, amountUSD: 10, status: "pending" });
  const r2 = await m.adminTopup(db, "admin", { kind: "ngn", paymentId: "p2" });
  near(r2.credited, 10);
});

test("retry after success returns the first result even if checks would now fail", async () => {
  reset();
  db.seed("users/creator", { username: "cre", is_live: true });
  db.seed("livestream_rooms/creator", { settings: {} });
  const id = rid();
  const r1 = await m.livePay(db, "fan", { creatorId: "creator", action: "tip", amount: 3, requestId: id });
  db.seed("users/creator", { username: "cre", is_live: false }); // live ended meanwhile
  const r2 = await m.livePay(db, "fan", { creatorId: "creator", action: "tip", amount: 3, requestId: id });
  assert.equal(r2.duplicate, true);
  assert.equal(r2.messageId, r1.messageId);
  near(bal("fan"), 97);
});

test("refund after ambassador claimed: commission taken from their earnings", async () => {
  reset();
  const at = Date.now() + 10 * 60000;
  const r = await m.bookCall(db, "fan", { creatorId: "referred", callType: "video", duration: 30, scheduledAt: at, requestId: rid() });
  near(db.data("users/amb").ambassadorBalance, 0.25); // 5% of $5
  await m.claimAmbassador(db, "amb");
  near(earn("amb"), 0.25);
  await m.refundCall(db, "fan", { bookingId: r.bookingId });
  near(db.data("users/amb").ambassadorBalance, 0);
  near(earn("amb"), 0);
  near(bal("fan"), 100);
});

test("community 'onetime' join is lifetime, priced as one-time", async () => {
  reset();
  db.seed("communities/c3", { creatorId: "creator", name: "C3", price: 10, oneTimePrice: 25, isPrivate: true });
  const r = await m.joinCommunity(db, "fan", { communityId: "c3", joinType: "onetime", expectedPrice: 25, requestId: rid() });
  near(r.price, 25);
  assert.equal(db.data("community_members/fan_c3").subscriptionEnd, null);
});

test("first-month discount only for a fan's first subscription; cancelled sub keeps tier until expiry", async () => {
  reset();
  db.seed("creator_discounts/creator", { first_month: { active: true, percent: 50 } });
  const r1 = await m.subscribe(db, "fan", { creatorId: "creator", tier: "supporter", duration: "monthly", requestId: rid() });
  near(r1.price, 5);
  const r2 = await m.subscribe(db, "fan", { creatorId: "creator", tier: "supporter", duration: "monthly", requestId: rid() });
  near(r2.price, 9.99);
  const P = require("../src/pricing");
  assert.equal(P.activeTier({ status: "cancelled", tier: "vip", expiresAt: Timestamp.fromMillis(Date.now() + 1e6) }), "vip");
  assert.equal(P.activeTier({ status: "cancelled", tier: "vip", expiresAt: Timestamp.fromMillis(Date.now() - 1e6) }), null);
});

test("PPV: paid to the message sender, never to a conversation's creatorId", async () => {
  reset();
  db.seed("conversations/cv", { participants: ["fan", "creator"], creatorId: "fan" }); // forged
  db.seed("conversations/cv/messages/m1", { senderId: "creator", isPPV: true, unlockPrice: 4 });
  await ledger.unlockMessage({ fanUid: "fan", conversationId: "cv", messageId: "m1" });
  near(bal("fan"), 96);
  near(earn("creator"), 3.2);
  near(earn("fan"), 0);
  db.seed("conversations/cv/messages/m2", { senderId: "creator", isPPV: false, unlockPrice: 4 });
  await assert.rejects(ledger.unlockMessage({ fanUid: "fan", conversationId: "cv", messageId: "m2" }), /not for sale/);
  // price snapshot wins over a later edit
  db.seed("conversations/cv/messages/m3", { senderId: "creator", isPPV: true, unlockPrice: 0.5 });
  db.seed("mediaPrivate/m3", { priceMinor: 600 });
  await ledger.unlockMessage({ fanUid: "fan", conversationId: "cv", messageId: "m3" });
  near(bal("fan"), 90);
});

test("call: creator no-show (fan waited alone) is refunded after the slot", async () => {
  reset();
  db.seed("creator_availability/creator", { videoCallPrice: 20, callsEnabled: true });
  const at = Date.now() + 10 * 60000;
  const r = await m.bookCall(db, "fan", { creatorId: "creator", callType: "video", duration: 30, scheduledAt: at, requestId: rid() });
  near(bal("fan"), 80);
  // fan started the call alone, creator never came, slot is now over
  const ref = `call_bookings/${r.bookingId}`;
  db.seed(ref, { ...db.data(ref), status: "in_progress", callStartedAt: Timestamp.fromMillis(at), userEnteredCallAt: Timestamp.fromMillis(at), scheduledAt: Timestamp.fromMillis(Date.now() - 60 * 60000) });
  const out = await m.refundCall(db, "fan", { bookingId: r.bookingId });
  assert.equal(out.status, "refunded");
  near(bal("fan"), 100);
  near(earn("creator"), 0);
});

test("call: a call both joined can't be refunded", async () => {
  reset();
  db.seed("creator_availability/creator", { videoCallPrice: 20, callsEnabled: true });
  const at = Date.now() + 10 * 60000;
  const r = await m.bookCall(db, "fan", { creatorId: "creator", callType: "video", duration: 30, scheduledAt: at, requestId: rid() });
  const ref = `call_bookings/${r.bookingId}`;
  db.seed(ref, { ...db.data(ref), status: "in_progress", callStartedAt: Timestamp.fromMillis(at), userEnteredCallAt: Timestamp.fromMillis(at), creatorEnteredCallAt: Timestamp.fromMillis(at), scheduledAt: Timestamp.fromMillis(Date.now() - 60 * 60000) });
  await assert.rejects(m.refundCall(db, "fan", { bookingId: r.bookingId }), /can't be refunded/);
  near(bal("fan"), 80);
});
