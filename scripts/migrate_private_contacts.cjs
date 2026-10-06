// scripts/migrate_private_contacts.cjs
// One-time: move email / phoneNumber OFF the public users/{uid} docs into user_private/{uid}
// (readable only by the user and admins). Run after deploying the new rules + app.
//   node scripts/migrate_private_contacts.cjs            (dry run)
//   node scripts/migrate_private_contacts.cjs --apply
const admin = require("../functions/node_modules/firebase-admin");
admin.initializeApp({ projectId: "ogfans-2d4a6" });
const db = admin.firestore();
const APPLY = process.argv.includes("--apply");

(async () => {
  let n = 0;
  for (const d of (await db.collection("users").get()).docs) {
    const u = d.data();
    if (!u.email && !u.phoneNumber) continue;
    n += 1;
    if (!APPLY) continue;
    await db.doc(`user_private/${d.id}`).set({
      ...(u.email ? { email: u.email } : {}),
      ...(u.phoneNumber ? { phoneNumber: u.phoneNumber } : {}),
    }, { merge: true });
    await d.ref.update({ email: admin.firestore.FieldValue.delete(), phoneNumber: admin.firestore.FieldValue.delete() });
  }
  console.log(`${n} profile(s) ${APPLY ? "moved" : "have public contact details — re-run with --apply"}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
