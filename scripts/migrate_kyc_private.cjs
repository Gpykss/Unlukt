// scripts/migrate_kyc_private.cjs
//
// One-time move of KYC details (ID number, DOB, address, ID photo links) OFF the public users/{uid}
// doc into the private kyc/{uid} doc (owner + admin only). Run once, right after deploying the
// new firestore.rules.
//
//   1. cd functions && npm install && cd ..
//   2. gcloud auth application-default login   (or GOOGLE_APPLICATION_CREDENTIALS=service-account.json)
//   3. Dry run:  node scripts/migrate_kyc_private.cjs
//   4. Apply:    node scripts/migrate_kyc_private.cjs --apply

const admin = require("../functions/node_modules/firebase-admin");

admin.initializeApp({ projectId: "ogfans-2d4a6" });
const db = admin.firestore();
const APPLY = process.argv.includes("--apply");

async function run() {
  const snap = await db.collection("users").get();
  let moved = 0;
  for (const userDoc of snap.docs) {
    const kycData = userDoc.get("kycData");
    if (!kycData || typeof kycData !== "object" || !Object.keys(kycData).length) continue;
    moved += 1;
    console.log(`${APPLY ? "Moving" : "Would move"} KYC for ${userDoc.id} (${userDoc.get("username") || "?"})`);
    if (!APPLY) continue;
    await db.collection("kyc").doc(userDoc.id).set({ ...kycData, userId: userDoc.id, migratedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    await userDoc.ref.update({ kycData: admin.firestore.FieldValue.delete() });
  }
  console.log(`${moved} user(s) ${APPLY ? "migrated" : "to migrate — re-run with --apply"}`);
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
