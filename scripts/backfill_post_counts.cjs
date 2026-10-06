// scripts/backfill_post_counts.cjs
// One-time: set users/{uid}.postCount (the protectPostMedia function keeps it current after this).
//   node scripts/backfill_post_counts.cjs           (dry run)
//   node scripts/backfill_post_counts.cjs --apply
const admin = require("../functions/node_modules/firebase-admin");
admin.initializeApp({ projectId: "ogfans-2d4a6" });
const db = admin.firestore();
const APPLY = process.argv.includes("--apply");

(async () => {
  const counts = {};
  (await db.collection("posts").get()).forEach((d) => {
    const p = d.data();
    if (p.userId && !p.archived) counts[p.userId] = (counts[p.userId] || 0) + 1;
  });
  for (const [uid, n] of Object.entries(counts)) {
    console.log(`${uid}: ${n}`);
    if (APPLY) await db.doc(`users/${uid}`).set({ postCount: n }, { merge: true });
  }
  console.log(`${Object.keys(counts).length} creator(s) ${APPLY ? "updated" : "— re-run with --apply"}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
