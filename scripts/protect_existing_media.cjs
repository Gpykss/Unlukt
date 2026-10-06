// scripts/protect_existing_media.cjs
//
// One-time: protect media on posts/PPV messages created BEFORE the protectPostMedia /
// protectMessageMedia functions were deployed. Moves original URLs into mediaPrivate/* and leaves
// blurred previews in the public docs (exactly what the functions do for new content).
//
//   1. cd functions && npm install && cd ..
//   2. gcloud auth application-default login
//   3. Dry run:  node scripts/protect_existing_media.cjs
//   4. Apply:    node scripts/protect_existing_media.cjs --apply

const admin = require("../functions/node_modules/firebase-admin");
admin.initializeApp({ projectId: "ogfans-2d4a6" });
const db = admin.firestore();
const media = require("../functions/src/media");
const APPLY = process.argv.includes("--apply");

async function run() {
  let posts = 0;
  let msgs = 0;
  const snap = await db.collection("posts").get();
  for (const d of snap.docs) {
    const p = d.data();
    if ((p.type || "free") === "free") continue;
    if (!(p.images || []).some((i) => i && i.url)) continue;
    posts += 1;
    console.log(`${APPLY ? "Protecting" : "Would protect"} post ${d.id} (${p.type})`);
    if (APPLY) await media.protectPost(d.id, p);
  }
  const ppv = await db.collectionGroup("messages").get(); // filtered below (no index needed)
  for (const d of ppv.docs) {
    const m = d.data();
    if (!m.isPPV || m.mediaProtected || (!m.mediaUrl && !m.content)) continue;
    const conversationId = d.ref.parent.parent.id;
    msgs += 1;
    console.log(`${APPLY ? "Protecting" : "Would protect"} PPV message ${d.id}`);
    if (APPLY) await media.protectMessage(conversationId, d.id, m);
  }
  console.log(`${posts} post(s), ${msgs} PPV message(s) ${APPLY ? "protected" : "to protect — re-run with --apply"}`);
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
