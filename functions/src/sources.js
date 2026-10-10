// functions/src/sources.js
//
// Traffic sources. A link like unlukt.com/skyla?src=reddit saves `signupSource: "reddit"` on the
// new user at sign-up (see src/utils/source.js). This report answers, for each source:
//   sign-ups        users who signed up from that link
//   funded wallets  of those, how many have at least one wallet top-up
//   paying fans     of those, how many have bought something (subscription, unlock, tip, call…)
//
// It reads every user, every top-up record and every purchase record once per run. That is fine
// for a young platform; when there are tens of thousands of users, switch to counters.

const NO_SOURCE = "(no source)";

const cleanSource = (v) => {
  const s = String(v == null ? "" : v).trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_.-]{0,39}$/.test(s) ? s : null;
};

const toMillis = (v) => (v && v.toMillis ? v.toMillis() : v && v.seconds ? v.seconds * 1000 : v ? new Date(v).getTime() : 0);

// Only download the fields we count on (the test database has no select())
const pick = (q, ...fields) => (typeof q.select === "function" ? q.select(...fields) : q);

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {{ sinceDays?: number|null }} [opts] only count people who signed up in the last N days
 */
async function sourceStats(db, opts = {}) {
  const days = Number(opts.sinceDays);
  const since = Number.isFinite(days) && days > 0 ? Date.now() - days * 24 * 60 * 60 * 1000 : null;

  const [users, topups, purchases] = await Promise.all([
    pick(db.collection("users"), "signupSource", "createdAt").get(),
    pick(db.collection("transactions").where("type", "==", "topup"), "userId").get(),
    pick(db.collection("purchases"), "fanId").get(),
  ]);

  const funded = new Set(topups.docs.map((d) => d.get("userId")).filter(Boolean));
  const paying = new Set(purchases.docs.map((d) => d.get("fanId")).filter(Boolean));

  const bySource = new Map();
  for (const u of users.docs) {
    if (since && !(toMillis(u.get("createdAt")) >= since)) continue;
    const source = cleanSource(u.get("signupSource")) || NO_SOURCE;
    const row = bySource.get(source) || { source, signups: 0, funded: 0, paying: 0 };
    row.signups += 1;
    if (funded.has(u.id)) row.funded += 1;
    if (paying.has(u.id)) row.paying += 1;
    bySource.set(source, row);
  }

  // Biggest source first; people with no source always last
  const rows = [...bySource.values()].sort((a, b) =>
    (a.source === NO_SOURCE) - (b.source === NO_SOURCE) || b.signups - a.signups || a.source.localeCompare(b.source));
  const totals = rows.reduce((t, r) => ({
    signups: t.signups + r.signups, funded: t.funded + r.funded, paying: t.paying + r.paying,
  }), { signups: 0, funded: 0, paying: 0 });

  return { rows, totals, sinceDays: since ? days : null, generatedAt: Date.now() };
}

module.exports = { sourceStats, cleanSource, NO_SOURCE };
