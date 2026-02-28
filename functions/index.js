// functions/index.js
const admin = require("firebase-admin");
const cors = require("cors");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

admin.initializeApp();

const corsHandler = cors({ origin: true });

// ✅ SECRET (stored in Firebase Secrets)
const BUNNY_STORAGE_PASSWORD = defineSecret("BUNNY_STORAGE_PASSWORD");

// ✅ NOT secrets (safe to hardcode)
const BUNNY_STORAGE_ZONE = "unlukt";
const BUNNY_STORAGE_HOST = "storage.bunnycdn.com";
const BUNNY_PULL_ZONE = "https://unlukt.b-cdn.net";

exports.createBunnyUpload = onRequest(
  {
    region: "us-central1",
    secrets: [BUNNY_STORAGE_PASSWORD],
  },
  (req, res) => {
    corsHandler(req, res, async () => {
      try {
        if (req.method !== "POST") {
          return res.status(405).json({ error: "Method not allowed" });
        }

        const authHeader = req.headers.authorization || "";
        const token = authHeader.startsWith("Bearer ")
          ? authHeader.slice(7)
          : null;

        if (!token) return res.status(401).json({ error: "Missing auth token" });

        const decoded = await admin.auth().verifyIdToken(token);
        const uid = decoded.uid;

        const { fileName, contentType } = req.body || {};
        if (!fileName || !contentType) {
          return res.status(400).json({ error: "fileName and contentType are required" });
        }

        // ✅ sanitize filename
        const safeName = String(fileName).replace(/[^\w.\-]/g, "_");
        const path = `uploads/${uid}/${Date.now()}_${safeName}`;

        // Bunny Storage endpoint
        const uploadUrl = `https://${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${path}`;

        // CDN URL you store in Firestore
        const cdnUrl = `${BUNNY_PULL_ZONE}/${path}`;

        return res.status(200).json({
          uploadUrl,
          headers: {
            // ✅ Bunny requires AccessKey header
            AccessKey: BUNNY_STORAGE_PASSWORD.value(),
            "Content-Type": contentType,
          },
          cdnUrl,
          path,
        });
      } catch (err) {
        console.error("createBunnyUpload error:", err);
        return res.status(500).json({ error: err?.message || "Server error" });
      }
    });
  }
);
