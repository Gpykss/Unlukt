// scripts/audit_legacy_money.cjs
//
// Before the security upgrade, the browser could write balances, subscriptions, unlocks, bookings
// and admin flags. This script lists anything that LOOKS forged so you can check it by hand
// before paying anyone out. It changes nothing unless you pass --fix (which only caps
// subscriptions that run more than 31 days into the future).
//
//   node scripts/audit_legacy_money.cjs            → report (also saved to audit_report.json)
//   node scripts/audit_legacy_money.cjs --fix      → report + cap over-long subscriptions

const fs = require("fs");
const admin = require("../functions/node_modules/firebase-admin");
admin.initializeApp({ projectId: "ogfans-2d4a6" });
const db = admin.firestore();
const FIX = process.argv.includes("--fix");
const ms = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : v ? new Date(v).getTime() : 0);
const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;

(async () => {
  const report = { admins: [], fanBalances: [], creatorBalances: [], subscriptions: [], bookings: [], unlocks: [] };

  // 1. Who has admin / ambassador / approved KYC
  const users = await db.collection("users").get();
  users.forEach((d) => {
    const u = d.data();
    if (u.isAdmin === true || u.role === "admin") report.admins.push({ uid: d.id, username: u.username, email: u.email, why: "ADMIN — confirm this is you" });
    if ((u.role === "ambassador" || u.isAmbassador) && !u.referralCode) report.admins.push({ uid: d.id, username: u.username, why: "ambassador without referral code (self-made?)" });
    if (u.kycStatus === "approved" && !u.kycReviewedAt) report.admins.push({ uid: d.id, username: u.username, why: "KYC approved but never reviewed by an admin" });
  });

  // 2. Fan balances vs verified top-ups (approved NGN + completed crypto)
  const verified = {};
  (await db.collection("ngn_payments").get()).forEach((d) => {
    const p = d.data();
    if (["approved", "completed"].includes(p.status)) verified[p.userId] = (verified[p.userId] || 0) + Number(p.creditedUSD || p.amountUSD || 0);
  });
  (await db.collection("crypto_payments").get()).forEach((d) => {
    const p = d.data();
    if (["completed", "confirmed"].includes(p.status) && p.contentType === "topup") verified[p.userId] = (verified[p.userId] || 0) + Number(p.baseAmount || p.amount || 0);
  });
  (await db.collection("user_balances").get()).forEach((d) => {
    const bal = Number(d.data().balance || 0);
    const v = verified[d.id] || 0;
    if (bal > v + 1) report.fanBalances.push({ uid: d.id, balance: r2(bal), verifiedTopUps: r2(v), excess: r2(bal - v) });
  });
  report.fanBalances.sort((a, b) => b.excess - a.excess);

  // 3. Creator earnings vs server-recorded sales
  const sales = {};
  (await db.collection("purchases").get()).forEach((d) => {
    const p = d.data();
    sales[p.creatorId] = (sales[p.creatorId] || 0) + Number(p.creatorNetMinor || 0) / 100;
  });
  (await db.collection("creator_balances").get()).forEach((d) => {
    const b = d.data();
    const avail = Number(b.availableBalance || 0);
    if (avail > (sales[d.id] || 0) + 1) {
      report.creatorBalances.push({ uid: d.id, available: r2(avail), serverRecordedSales: r2(sales[d.id] || 0), unexplained: r2(avail - (sales[d.id] || 0)) });
    }
  });
  report.creatorBalances.sort((a, b) => b.unexplained - a.unexplained);

  // 4. Subscriptions that run suspiciously far ahead
  const subs = await db.collection("subscriptions").get();
  for (const d of subs.docs) {
    const s = d.data();
    if (s.status !== "active") continue;
    const exp = ms(s.expiresAt);
    if (!exp || exp > Date.now() + 31 * 864e5) {
      report.subscriptions.push({ id: d.id, expiresAt: exp ? new Date(exp).toISOString() : "never", serverPaid: !!s.ledgerTxId });
      if (FIX && !s.ledgerTxId) await d.ref.update({ expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 30 * 864e5), auditCapped: true });
    }
  }

  // 5. Open bookings made before server payments
  (await db.collection("call_bookings").get()).forEach((d) => {
    const b = d.data();
    if (b.ledgerTxId || !["confirmed", "in_progress", "completed"].includes(b.status)) return;
    if (b.status === "completed" && b.creatorPaid !== false) return;
    report.bookings.push({ id: d.id, fan: b.userId, creator: b.creatorId, price: b.price, creatorEarning: b.creatorEarning, status: b.status, creatorPaid: b.creatorPaid,
      note: "set legacyVerified: true on this booking (Firestore console) once you've confirmed the fan really paid" });
  });

  // 6. Unlocks with no server purchase behind them
  const purchased = new Set();
  (await db.collection("unlocks").get()).forEach((d) => purchased.add(d.id));
  (await db.collection("unlocked_content").get()).forEach((d) => {
    const u = d.data();
    if (u.postId && !purchased.has(`${u.postId}_${u.userId}`)) report.unlocks.push({ id: d.id, user: u.userId, post: u.postId });
  });

  fs.writeFileSync("audit_report.json", JSON.stringify(report, null, 2));
  for (const [k, v] of Object.entries(report)) console.log(`${k}: ${v.length} to review`);
  console.log("Details saved to audit_report.json");
  if (report.fanBalances.length || report.creatorBalances.length) {
    console.log("⚠️  Don't approve payouts for creators listed under creatorBalances until you've checked their sales.");
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
