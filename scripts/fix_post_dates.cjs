// scripts/fix_post_dates.cjs
//
// One-time repair for posts saved with a broken createdAt/updatedAt (an empty map instead of a
// Timestamp — caused by the old deepClean() in postService.js). Sets each broken field to the
// document's real Firestore creation/update time, so post times and feed order become accurate.
//
// Run from the project root (uses firebase-admin from functions/node_modules):
//   1. cd functions && npm install && cd ..
//   2. Auth once:  gcloud auth application-default login
//      (or set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON for ogfans-2d4a6)
//   3. Dry run:    node scripts/fix_post_dates.cjs
//   4. Apply:      node scripts/fix_post_dates.cjs --apply

const admin = require("../functions/node_modules/firebase-admin");

admin.initializeApp({ projectId: "ogfans-2d4a6" });
const db = admin.firestore();
const APPLY = process.argv.includes("--apply");

const isTimestamp = (v) => v instanceof admin.firestore.Timestamp;

async function run() {
  const snap = await db.collection("posts").get();
  let broken = 0;
  let batch = db.batch();
  let inBatch = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    const update = {};
    if (!isTimestamp(d.createdAt)) update.createdAt = doc.createTime;
    if (!isTimestamp(d.updatedAt)) update.updatedAt = doc.updateTime;
    if (Object.keys(update).length === 0) continue;

    broken++;
    console.log(`${APPLY ? "fixing" : "would fix"} ${doc.id} → createdAt ${doc.createTime.toDate().toISOString()}`);
    if (APPLY) {
      batch.update(doc.ref, update);
      if (++inBatch === 400) {
        await batch.commit();
        batch = db.batch();
        inBatch = 0;
      }
    }
  }
  if (APPLY && inBatch > 0) await batch.commit();

  console.log(`\n${snap.size} posts checked, ${broken} ${APPLY ? "fixed" : "need fixing (re-run with --apply)"}.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
