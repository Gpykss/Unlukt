// functions/index.js
const admin = require("firebase-admin");
const cors = require("cors");
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { setGlobalOptions } = require("firebase-functions/v2");

admin.initializeApp();

// App Check for the callable functions (payments, unlocks, media…): once it is switched on, only
// the real Unlukt site can call them. OFF by default — turn it on by adding ENFORCE_APPCHECK=true
// to functions/.env and redeploying, and only after the site is live with VITE_APPCHECK_SITE_KEY
// and the App Check page in the Firebase console shows requests as "verified".
setGlobalOptions({ enforceAppCheck: process.env.ENFORCE_APPCHECK === "true" });

const corsHandler = cors({ origin: true });

// ✅ SECRETS
const BUNNY_STORAGE_PASSWORD = defineSecret("BUNNY_STORAGE_PASSWORD");
const NOWPAYMENTS_API_KEY = defineSecret("NOWPAYMENTS_API_KEY");
const NOWPAYMENTS_IPN_SECRET = defineSecret("NOWPAYMENTS_IPN_SECRET");
const AGORA_APP_ID = defineSecret("AGORA_APP_ID");
const AGORA_APP_CERTIFICATE = defineSecret("AGORA_APP_CERTIFICATE");
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
// Bunny pull zone "URL Token Authentication Key": if set in environment, signs expiring links for paid media


// ✅ NOT secrets (safe to hardcode)
const BUNNY_STORAGE_ZONE = "unlukt";
const BUNNY_STORAGE_HOST = "storage.bunnycdn.com";
const BUNNY_PULL_ZONE = "https://unlukt.b-cdn.net";

// ========== AGORA TOKEN GENERATION ==========
// ── Security helpers ─────────────────────────────────────────────────────────
// Escape user-controlled text before putting it in email HTML (names, reasons, addresses).
const esc = (v) => String(v == null ? "" : v)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// Simple Firestore-backed rate limit: at most `max` hits per `windowMs` for a key.
// Returns true when the caller is over the limit.
async function overLimit(key, max, windowMs) {
  const db = admin.firestore();
  const ref = db.collection("_rate_limits").doc(key.replace(/[^\w@.-]/g, "_").slice(0, 200));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const hits = (snap.exists ? snap.data().hits || [] : []).filter((t) => now - t < windowMs);
    if (hits.length >= max) return true;
    hits.push(now);
    tx.set(ref, { hits, updatedAt: now });
    return false;
  });
}

// Users' emails are private (not on the public profile) — look them up from Auth / user_private
async function emailOf(uid, fallback = "") {
  try {
    const u = await admin.auth().getUser(uid);
    if (u.email) return u.email;
  } catch { /* not found */ }
  try {
    const p = await admin.firestore().doc(`user_private/${uid}`).get();
    return (p.exists && p.get("email")) || fallback;
  } catch { return fallback; }
}

exports.getAgoraToken = onRequest(
  {
    region: "us-central1",
    secrets: [AGORA_APP_ID, AGORA_APP_CERTIFICATE],
  },
  (req, res) => {
    corsHandler(req, res, async () => {
      try {
        if (req.method !== "POST") {
          return res.status(405).json({ error: "Method not allowed" });
        }

        // Verify Firebase auth
        const authHeader = req.headers.authorization || "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
        if (!token) return res.status(401).json({ error: "Missing auth token" });

        const decoded = await admin.auth().verifyIdToken(token);
        const uid = decoded.uid;

        const { channelName, bookingId, creatorId, isLivestream } = req.body || {};
        if (!channelName) return res.status(400).json({ error: "channelName is required" });

        const db = admin.firestore();
        const { RtcTokenBuilder, RtcRole } = require("agora-token");

        let role = RtcRole.PUBLISHER; // Default

        // 1. If it's a livestream channel
        if (typeof channelName !== "string" || channelName.length > 128) {
          return res.status(400).json({ error: "Invalid channel" });
        }
        if (isLivestream || channelName.startsWith("livestream_")) {
          if (!channelName.startsWith("livestream_")) return res.status(400).json({ error: "Invalid channel" });
          // The host is ALWAYS the creator named in the channel — never trust a creatorId sent by the
          // client (that let anyone get a host token on someone else's live).
          const resolvedCreatorId = channelName.slice("livestream_".length);
          void creatorId;

          if (uid === resolvedCreatorId) {
            role = RtcRole.PUBLISHER;
          } else {
            // Guests the creator accepted on stage (livestream_rooms/{creator}.stageGuests) or legacy co-hosts
            const roomSnap = await db.collection("livestream_rooms").doc(resolvedCreatorId).get();
            const onStage = (roomSnap.exists ? roomSnap.get("stageGuests") || [] : [])
              .some((g) => g && g.userId === uid);
            const cohostSnap = onStage ? null : await db.collection("cohost_requests")
              .where("userId", "==", uid)
              .where("creatorId", "==", resolvedCreatorId)
              .where("status", "==", "accepted")
              .limit(1)
              .get();

            role = (onStage || (cohostSnap && !cohostSnap.empty)) ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;

            // Check if user has an active, unexpired ticket for this room
            const now = new Date();
            const ticketsSnap = await db.collection("livestream_tickets")
              .where("userId", "==", uid)
              .where("creatorId", "==", resolvedCreatorId)
              .where("expiresAt", ">", now)
              .limit(1)
              .get();

            // Creator chooses free or paid lives (users/{creator}.livestreamFree; unset = free)
            // Free or paid: what the live room shows (room settings) wins over the profile field
            let isFreeLive = true;
            if (ticketsSnap.empty) {
              const roomSettings = roomSnap.exists ? roomSnap.get("settings") : null;
              if (roomSettings && typeof roomSettings.entryFree === "boolean") {
                isFreeLive = roomSettings.entryFree;
              } else {
                const liveCreatorSnap = await db.collection("users").doc(resolvedCreatorId).get();
                isFreeLive = liveCreatorSnap.get("livestreamFree") !== false;
              }
            }

            if (ticketsSnap.empty && !isFreeLive) {
              // No ticket yet → buy a 1-hour ticket (server price, standard 80/90/5 split, idempotent per hour)
              const { buyLiveTicket } = require("./src/money");
              try {
                await buyLiveTicket(db, uid, resolvedCreatorId);
              } catch (e) {
                if (/Insufficient/i.test(e.message || "")) throw new Error("INSUFFICIENT_FUNDS");
                throw e;
              }
            }
          }
        } else {
          // 2. Private 1-on-1 call: channel must be video_<bookingId> / voice_<bookingId> and the
          //    caller must be the fan or creator on that booking. (Before, leaving out bookingId
          //    gave a token for ANY channel — anyone could join someone else's private call.)
          const m = /^(video|voice)_([\w-]{6,})$/.exec(channelName);
          if (!m) return res.status(400).json({ error: "Invalid call channel" });
          const realBookingId = m[2];
          if (bookingId && bookingId !== realBookingId) {
            return res.status(400).json({ error: "Booking does not match channel" });
          }
          const bookingSnap = await db.collection("call_bookings").doc(realBookingId).get();
          if (!bookingSnap.exists) {
            return res.status(404).json({ error: "Booking not found" });
          }
          const booking = bookingSnap.data();
          if (booking.userId !== uid && booking.creatorId !== uid) {
            return res.status(403).json({ error: "Not authorized for this booking" });
          }
          if (!["confirmed", "in_progress"].includes(booking.status)) {
            return res.status(403).json({ error: `This call is ${booking.status}` });
          }
        }

        const appId = AGORA_APP_ID.value().trim();
        const appCertificate = AGORA_APP_CERTIFICATE.value().trim();
        const expirationTimeInSeconds = 3600; // 1 hour
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

        const numericUid = 0; // Agora automatically assigns

        const agoraToken = RtcTokenBuilder.buildTokenWithUid(
          appId,
          appCertificate,
          channelName,
          numericUid,
          role,
          privilegeExpiredTs,
          privilegeExpiredTs
        );

        console.log(`✅ Agora token generated. Channel: ${channelName}, user: ${uid}, role: ${role}`);

        return res.status(200).json({
          token: agoraToken,
          appId,
          channelName,
          uid: numericUid,
          expiresAt: privilegeExpiredTs,
        });

      } catch (err) {
        console.error("getAgoraToken error:", err);
        if (err.message === "INSUFFICIENT_FUNDS") {
          return res.status(402).json({ error: "INSUFFICIENT_FUNDS" });
        }
        if (err?.code === "auth/id-token-expired" || err?.code === "auth/argument-error") {
          return res.status(401).json({ error: "Session expired — please sign in again" });
        }
        return res.status(500).json({ error: "Could not connect — please try again" });
      }
    });
  }
);

// ========== BUNNY.NET UPLOAD ==========
// createBunnyUpload REMOVED: it returned the Bunny storage password (AccessKey) to any signed-in
// user, which allows deleting/overwriting every file in the storage zone. Uploads go through
// uploadToBunny (server-side PUT). If this was ever deployed: ROTATE the Bunny storage password.
exports.createBunnyUpload = onRequest({ region: "us-central1" }, (req, res) => {
  res.status(410).json({ error: "Gone — use uploadToBunny" });
});

// ========== NOWPAYMENTS WEBHOOK ==========
exports.nowpaymentsWebhook = onRequest(
  {
    region: "us-central1",
    secrets: [NOWPAYMENTS_API_KEY, NOWPAYMENTS_IPN_SECRET],
  },
  async (req, res) => {
    try {
      if (req.method !== "POST") {
        return res.status(405).send("Method Not Allowed");
      }

      const signature = req.headers['x-nowpayments-sig'];
      const ipnSecret = NOWPAYMENTS_IPN_SECRET.value();

      const crypto = require('crypto');
      const sortedBody = JSON.stringify(sortObject(req.body));
      const expectedSignature = crypto
        .createHmac('sha512', ipnSecret)
        .update(sortedBody)
        .digest('hex');

      const sigBuf = Buffer.from(String(signature || ""), "utf8");
      const expBuf = Buffer.from(expectedSignature, "utf8");
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        console.error('❌ Invalid webhook signature');
        return res.status(401).send('Invalid signature');
      }

      // Log only what's needed to trace a payment (no payer email / addresses in logs)
      console.log('✅ IPN verified', { payment_id: req.body?.payment_id, order_id: req.body?.order_id, status: req.body?.payment_status });

      const db = admin.firestore();
      const ipnData = req.body;

      const {
        payment_id, payment_status, pay_address, price_amount,
        price_currency, pay_amount, actually_paid, pay_currency,
        order_id, order_description, payin_hash, payer_email,
        created_at, updated_at,
      } = ipnData;

      if (!order_id) {
        console.error('❌ No order_id in webhook payload');
        return res.status(200).send('OK');
      }

      const paymentsRef = db.collection('crypto_payments');
      const snap = await paymentsRef.where('reference', '==', order_id).limit(1).get();

      if (snap.empty) {
        console.error(`❌ No payment found for reference: ${order_id}`);
        return res.status(200).send('OK');
      }

      const paymentDoc    = snap.docs[0];
      const paymentDocRef = paymentDoc.ref;
      const paymentData   = paymentDoc.data();

      console.log(`✅ Found payment doc: ${paymentDoc.id} — current status: ${paymentData.status}`);

      const statusMap = {
        waiting:        'pending_payment',
        confirming:     'confirming',
        confirmed:      'confirmed',
        finished:       'completed',
        partially_paid: 'partially_paid',
        failed:         'failed',
        refunded:       'refunded',
        expired:        'expired',
      };
      const newStatus = statusMap[payment_status] || payment_status;

      const updateData = {
        nowPaymentsStatus:    payment_status,
        nowPaymentsPaymentId: String(payment_id || ''),
        payAddress:           pay_address     || null,
        payAmount:            pay_amount      || 0,
        actuallypaid:         actually_paid   || 0,
        payCurrency:          pay_currency    || null,
        txHash:               payin_hash      || null,
        payerEmail:           payer_email     || null,
        nowPaymentsUpdatedAt: updated_at      || null,
        updatedAt:            admin.firestore.FieldValue.serverTimestamp(),
        ipnPayload:           ipnData,
      };

      if (payment_status === 'finished' || payment_status === 'confirmed') {
        if (paymentData.status === 'completed') {
          console.log(`⚠️  Payment ${paymentDoc.id} already processed — skipping`);
          return res.status(200).send('OK');
        }
        await processPayment(db, paymentData, paymentDoc.id, price_amount);
        console.log(`🎉 Payment ${paymentDoc.id} fully processed`);
        updateData.status = 'completed';
      } else {
        updateData.status = newStatus;
      }

      await paymentDocRef.update(updateData);
      console.log(`✅ Payment ${paymentDoc.id} updated to status: ${updateData.status || newStatus}`);

      return res.status(200).send('OK');
    } catch (error) {
      console.error("❌ Webhook error:", error);
      return res.status(200).send('OK');
    }
  }
);

function sortObject(obj) {
  return Object.keys(obj).sort().reduce((result, key) => {
    result[key] = obj[key];
    return result;
  }, {});
}

// ========== PROCESS SUCCESSFUL PAYMENT ==========
async function processPayment(db, paymentData, paymentId, signedPriceUsd) {
  const { contentType, contentId, creatorId, userId, baseAmount, amount } = paymentData;

  try {
    // ✅ Use the amount from the signed NowPayments IPN (invoice incl. 1.5% VAT), never the
    // client-editable payment doc. Fall back to the doc only if the IPN has no price.
    const signed = Number(signedPriceUsd);
    const finalAmount = signed > 0
      ? Math.round((signed / 1.015) * 100) / 100
      : (baseAmount || amount);
    console.log(`🔄 Processing ${contentType} payment for user ${userId}`);

    switch (contentType) {
      case "subscription":
        await db.collection("subscriptions").doc(`${userId}_${creatorId}`).set({
          userId,
          creatorId,
          paymentId,
          amount: finalAmount,
          tier: paymentData.tier || "supporter",
          paymentType: "crypto",
          status: "active",
          startedAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        break;

      case "unlock":
        await db.collection("unlocked_content").add({
          userId, contentId, creatorId, paymentId, amount: finalAmount,
          paymentType: "crypto",
          unlockedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        break;

      case "topup": {
        const receivedMinor = Math.round(finalAmount * 100);
        if (receivedMinor > 0) {
          const { creditTopup } = require("./src/ledger");
          const topupRes = await creditTopup({
            providerPaymentId: String(paymentId || `topup_${Date.now()}`),
            fanUid: userId,
            receivedMinor,
          });

          if (topupRes.credited) {
            const balSnap = await db.collection("user_balances").doc(userId).get();
            const balanceAfter = balSnap.exists ? (balSnap.data().balance || finalAmount) : finalAmount;

            await db.collection("transactions").add({
              userId,
              amount: finalAmount,
              type: "topup",
              description: "Wallet top-up (Crypto)",
              paymentId: paymentId || null,
              balanceAfter,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        }
        break;
      }

      case "tip":
        await db.collection("tips").add({
          fromUserId: userId, toCreatorId: creatorId, paymentId,
          amount: finalAmount, paymentType: "crypto",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        break;
    }

    // ✅ Same split as everywhere else: 80/20 normal, 90/10 ambassador, 80/5/15 referred (1 yr).
    // Earnings are instant (crypto) → credited to available, not pending. Idempotent per payment.
    if (creatorId && contentType !== "topup") {
      const { creditDirectSale } = require("./src/ledger");
      await creditDirectSale({
        paymentId,
        creatorId,
        fanUid: userId,
        grossMinor: Math.round(finalAmount * 100),
        source: contentType,
      });
    }

    await db.collection("notifications").add({
      userId, type: "payment_verified",
      message: "Your payment has been confirmed!",
      paymentId, read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`✅ Payment ${paymentId} processed successfully`);
  } catch (error) {
    console.error("❌ Error processing payment:", error);
    throw error;
  }
}

// ========== CREATE NOWPAYMENTS INVOICE ==========
exports.createPayment = onRequest(
  {
    region: "us-central1",
    secrets: [NOWPAYMENTS_API_KEY],
    cors: true,
    memory: "512MiB",
    minInstances: 0,
  },
  async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(204).send('');

    try {
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

      const authHeader = req.headers.authorization || "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (!token) return res.status(401).json({ error: "Missing auth token" });

      const decoded = await admin.auth().verifyIdToken(token);
      const uid = decoded.uid;

      const { amount, userName, userCountry } = req.body || {};
      // Crypto is only used for WALLET TOP-UPS. Unlocks/subs/tips are paid from the wallet.
      // (Before, the client chose contentType/contentId/creatorId/amount, so a $1 invoice could
      // unlock any post or subscription.)
      const contentType = "topup";
      const contentId = null;
      const creatorId = null;
      const userEmail = decoded.email || null;
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt < 1 || amt > 5000) {
        return res.status(400).json({ error: "Top-up amount must be between $1 and $5,000" });
      }
      if (await overLimit(`pay_${uid}`, 10, 60 * 60 * 1000)) {
        return res.status(429).json({ error: "Too many payment attempts — try again later" });
      }

      const reference = `CRYPTO_${Date.now()}_${uid.substring(0, 8)}`;

      const baseAmount = Math.round(amt * 100) / 100;
      const vatPercentage = 1.5;
      const totalAmount = parseFloat((baseAmount * 1.015).toFixed(2));
      const vatAmount = parseFloat((totalAmount - baseAmount).toFixed(2));

      const nowPaymentResponse = await fetch("https://api.nowpayments.io/v1/invoice", {
        method: "POST",
        headers: { "x-api-key": NOWPAYMENTS_API_KEY.value(), "Content-Type": "application/json" },
        body: JSON.stringify({
          price_amount: totalAmount,
          price_currency: "usd",
          order_id: reference,
          order_description: `${contentType} - ${userName}`,
          success_url: `${req.headers.origin || 'https://your-domain.com'}/payment-success?ref=${reference}`,
          cancel_url: `${req.headers.origin || 'https://your-domain.com'}/wallet`,
        }),
      });

      if (!nowPaymentResponse.ok) {
        const errorData = await nowPaymentResponse.json();
        return res.status(500).json({ error: errorData.message || "Payment creation failed" });
      }

      const nowPaymentData = await nowPaymentResponse.json();
      const db = admin.firestore();

      const docRef = await db.collection("crypto_payments").add({
        reference, nowPaymentsId: nowPaymentData.id, userId: uid,
        userEmail, userName, contentId: contentId || null, contentType,
        creatorId: creatorId || null, amount: totalAmount,
        baseAmount, vatAmount, vatPercentage, currency: "USD",
        cryptoCurrency: "Multi-coin", network: "Dashboard Selection", paymentMethod: "nowpayments",
        status: "pending_payment", userCountry: userCountry || "Unknown",
        nowPaymentsUrl: nowPaymentData.invoice_url,
        nowPaymentsStatus: nowPaymentData.payment_status || "waiting",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        metadata: { platform: "unlukt", source: "web", hasVAT: vatAmount > 0 },
      });

      return res.status(200).json({
        success: true, paymentId: docRef.id, reference,
        paymentUrl: nowPaymentData.invoice_url, amount: totalAmount,
      });
    } catch (error) {
      console.error("❌ Create payment error:", error);
      return res.status(500).json({ error: "Could not start the payment — please try again" });
    }
  }
);

const Busboy = require("busboy");
const PAID_UPLOAD_FOLDERS = ["paid", "ppv-messages"];

exports.uploadToBunny = onRequest(
  {
    region: "us-central1",
    secrets: [BUNNY_STORAGE_PASSWORD],
    rawBody: true,
    memory: "2GiB",          // ✅ Raises body buffer limit — handles large video uploads
    timeoutSeconds: 300,     // ✅ 5 min timeout for large files
    maxInstances: 10,
    invoker: "public",       // ✅ Auth is handled manually via Bearer token
  },
  (req, res) => {
    corsHandler(req, res, async () => {
      try {
        if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

        const token = (req.headers.authorization || "").replace("Bearer ", "");
        if (!token) return res.status(401).json({ error: "Missing auth token" });
        const decoded = await admin.auth().verifyIdToken(token);
        const uid = decoded.uid;

        const fileBuffer = await new Promise((resolve, reject) => {
          const busboy = Busboy({ headers: req.headers });
          let buffer = null;
          let mimeType = "application/octet-stream";
          let originalName = "file";
          let folder = "";

          busboy.on("field", (name, value) => { if (name === "folder") folder = String(value || "").slice(0, 40); });
          busboy.on("file", (_, file, info) => {
            mimeType = info.mimeType;
            originalName = info.filename;
            const chunks = [];
            file.on("data", (d) => chunks.push(d));
            file.on("end", () => (buffer = Buffer.concat(chunks)));
          });

          busboy.on("finish", () => buffer ? resolve({ buffer, mimeType, originalName, folder }) : reject(new Error("No file")));
          busboy.on("error", reject);
          const { Readable } = require("stream");
          const readable = new Readable();
          readable.push(req.rawBody);
          readable.push(null);
          readable.pipe(busboy);
        });

        // Only images and videos; never HTML/SVG/JS (those would be served from our CDN domain)
        const EXT = {
          "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
          "image/heic": "heic", "image/heif": "heif", "image/avif": "avif", "image/bmp": "bmp",
          "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "video/x-m4v": "m4v", "video/3gpp": "3gp",
        };
        const mt = String(fileBuffer.mimeType || "").toLowerCase();
        const okType = !!EXT[mt];
        if (!okType) return res.status(415).json({ error: "Only photos and videos can be uploaded" });
        const maxBytes = fileBuffer.mimeType.startsWith("video/") ? 500 * 1024 * 1024 : 25 * 1024 * 1024;
        if (fileBuffer.buffer.length > maxBytes) return res.status(413).json({ error: "File is too large" });
        if (await overLimit(`upload_${uid}`, 120, 60 * 60 * 1000)) {
          return res.status(429).json({ error: "Upload limit reached — try again later" });
        }

        // Extension always comes from the checked type, never the client's file name
        // (x.html sent as image/png would otherwise be served as a web page from our CDN)
        const base = String(fileBuffer.originalName || "file").replace(/\.[^.]*$/, "").replace(/[^\w\-]/g, "_").slice(-60) || "file";
        // Paid media (locked posts, PPV messages) goes in private/ — Bunny only serves that folder
        // with a signed, expiring link (see functions/src/media.js). Everything else stays public.
        const root = PAID_UPLOAD_FOLDERS.includes(fileBuffer.folder) ? "private" : "uploads";
        const path = `${root}/${uid}/${Date.now()}_${base}.${EXT[mt]}`;
        const uploadUrl = `https://${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${path}`;

        const bunnyRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { AccessKey: BUNNY_STORAGE_PASSWORD.value(), "Content-Type": mt === "image/jpg" ? "image/jpeg" : mt },
          body: fileBuffer.buffer,
        });

        if (!bunnyRes.ok) {
          const err = await bunnyRes.text();
          throw new Error(`Bunny upload failed: ${err}`);
        }

        return res.status(200).json({
          success: true,
          cdnUrl: `${BUNNY_PULL_ZONE}/${path}`,
          objectPath: path,
          mimeType: fileBuffer.mimeType,
          size: fileBuffer.buffer.length,
        });

      } catch (err) {
        console.error("uploadToBunny error:", err);
        return res.status(500).json({ error: "Upload failed — please try again" });
      }
    });
  }
);

// ========== RESEND EMAIL FUNCTIONS ==========
const { Resend } = require("resend");

exports.sendCustomVerification = onRequest(
  {
    region: "us-central1",
    secrets: [RESEND_API_KEY],
    cors: true,
  },
  (req, res) => {
    corsHandler(req, res, async () => {
      try {
        if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
        
        const authHeader = req.headers.authorization || "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
        if (!token) return res.status(401).json({ error: "Missing auth token" });

        const decoded = await admin.auth().verifyIdToken(token);
        const email = decoded.email;
        if (await overLimit(`verify_${decoded.uid}`, 5, 60 * 60 * 1000)) {
          return res.status(429).json({ error: "Too many requests — check your inbox or try again later" });
        }

        const actionLink = await admin.auth().generateEmailVerificationLink(email);
        const resend = new Resend(RESEND_API_KEY.value());
        
        await resend.emails.send({
          from: "Unlukt <noreply@unlukt.com>",
          to: email,
          subject: "Verify Your Email Address",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9f9f9; padding: 20px; border-radius: 8px;">
              <h2 style="color: #333; text-align: center;">Welcome to Unlukt!</h2>
              <p style="color: #555; font-size: 16px; line-height: 1.5;">Thank you for joining our community. Please verify your email address to unlock your full access.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${actionLink}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">Verify Email Address</a>
              </div>
              <p style="color: #777; font-size: 14px; text-align: center;">If you didn't create this account, you can safely ignore this email.</p>
            </div>
          `,
        });

        return res.status(200).json({ success: true });
      } catch (err) {
        console.error("sendCustomVerification error:", err);
        return res.status(500).json({ error: "Could not send the email — try again shortly" });
      }
    });
  }
);

// ========== SEND WELCOME EMAIL FOR SOCIAL AUTH USERS (Google/Twitter) ==========
exports.sendSocialWelcomeEmail = onRequest(
  {
    region: "us-central1",
    secrets: [RESEND_API_KEY],
    cors: true,
  },
  (req, res) => {
    corsHandler(req, res, async () => {
      try {
        if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

        const authHeader = req.headers.authorization || "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
        if (!token) return res.status(401).json({ error: "Missing auth token" });

        const decoded = await admin.auth().verifyIdToken(token);

        // Only ever email the signed-in user's own address (was: any address from the request body)
        const email = decoded.email;
        if (!email) return res.status(400).json({ error: "No email on this account" });
        if (await overLimit(`welcome_${decoded.uid}`, 2, 24 * 60 * 60 * 1000)) {
          return res.status(200).json({ success: true });
        }

        const name = esc(String((req.body && req.body.displayName) || decoded.name || "there").slice(0, 60));
        const resend = new Resend(RESEND_API_KEY.value());

        await resend.emails.send({
          from: "Unlukt <noreply@unlukt.com>",
          to: email,
          subject: "Welcome to Unlukt! 🎉",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9f9f9; padding: 20px; border-radius: 8px;">
              <h2 style="color: #333; text-align: center;">Welcome to Unlukt, ${name}! 🎉</h2>
              <p style="color: #555; font-size: 16px; line-height: 1.5;">
                You've successfully signed up using your social account. You're all set to start exploring the best content from your favorite creators.
              </p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="https://unlukt.com/discover" style="background-color: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                  Start Exploring
                </a>
              </div>
              <p style="color: #777; font-size: 14px; text-align: center;">
                If you have any questions, reply directly to this email — we're happy to help!
              </p>
            </div>
          `,
        });

        console.log(`✅ Social welcome email sent to ${email}`);
        return res.status(200).json({ success: true });
      } catch (err) {
        console.error("sendSocialWelcomeEmail error:", err);
        return res.status(500).json({ error: "Could not send the email — try again shortly" });
      }
    });
  }
);

exports.sendCustomPasswordReset = onRequest(
  {
    region: "us-central1",
    secrets: [RESEND_API_KEY],
    cors: true,
  },
  (req, res) => {
    corsHandler(req, res, async () => {
      try {
        if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
        
        const email = String((req.body && req.body.email) || "").trim().toLowerCase();
        if (!email || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) {
          return res.status(400).json({ error: "Missing email" });
        }
        // The LAST x-forwarded-for hop is added by Google's front end; earlier ones are client-supplied
        const ip = String(req.headers["x-forwarded-for"] || req.ip || "").split(",").pop().trim();
        // Stop email-bombing: 3 per address per hour, 20 per IP per hour (always answer "ok")
        if (await overLimit(`reset_${email}`, 3, 60 * 60 * 1000) || await overLimit(`resetip_${ip}`, 20, 60 * 60 * 1000)) {
          return res.status(200).json({ success: true });
        }

        const actionLink = await admin.auth().generatePasswordResetLink(email);
        const resend = new Resend(RESEND_API_KEY.value());
        
        await resend.emails.send({
          from: "Unlukt <noreply@unlukt.com>",
          to: email,
          subject: "Reset Your Password",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9f9f9; padding: 20px; border-radius: 8px;">
              <h2 style="color: #333; text-align: center;">Password Reset Request</h2>
              <p style="color: #555; font-size: 16px; line-height: 1.5;">We received a request to reset your password. Click the button below to choose a new password.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${actionLink}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">Reset Password</a>
              </div>
              <p style="color: #777; font-size: 14px; text-align: center;">If you didn't request a password reset, you can safely ignore this email.</p>
            </div>
          `,
        });

        return res.status(200).json({ success: true });
      } catch (err) {
        console.error("sendCustomPasswordReset error:", err);
        return res.status(200).json({ success: true }); 
      }
    });
  }
);

const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");

exports.onUserCreatedWelcome = onDocumentCreated(
  {
    document: "user_profiles/{uid}",
    region: "europe-west1",
    memory: "256MiB",
    secrets: [RESEND_API_KEY],
  },
  async (event) => {
    try {
      const snapshot = event.data;
      if (!snapshot) return;

      const profile = snapshot.data();
      const email = profile.email;
      const displayName = profile.displayName || "there";

      if (!email) return;

      const resend = new Resend(RESEND_API_KEY.value());

      await resend.emails.send({
        from: "Unlukt <noreply@unlukt.com>",
        to: email,
        subject: "Welcome to Unlukt! \uD83C\uDF89",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9f9f9; padding: 20px; border-radius: 8px;">
            <h2 style="color: #333; text-align: center;">Welcome to the Community, ${displayName}!</h2>
            <p style="color: #555; font-size: 16px; line-height: 1.5;">We are thrilled to have you here at Unlukt. Dive in to explore the best content from your favorite creators.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="https://unlukt.com/discover" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">Start Exploring</a>
            </div>
            <p style="color: #777; font-size: 14px; text-align: center;">If you run into any issues, you can reply directly to this email.</p>
          </div>
        `,
      });
      console.log(`✅ Welcome email sent to ${email}`);
    } catch (error) {
      console.error("onUserCreatedWelcome error:", error);
    }
  }
);

// ========== AMBASSADOR COMMISSION ==========
// Removed the old "onPayoutComplete" trigger: it paid the 5% referral a SECOND time on top of the
// commission already paid at sale time, and any user could trigger it by writing a fake transaction.
// Referral commission is now paid once, at sale time (ledger.js → writeReferral / commissionService.js).

// ============================================================
// ✅ EMAIL NOTIFICATIONS (Resend)
// ============================================================
// (imports already declared above)

const ADMIN_EMAIL = "support@unlukt.com"; // ← your inbox
const FROM_EMAIL  = "Unlukt <noreply@unlukt.com>";

// ── helper ──────────────────────────────────────────────────
async function sendEmail(apiKey, { to, subject, html }) {
  const resend = new Resend(apiKey);
  try {
    await resend.emails.send({ from: FROM_EMAIL, to, subject, html });
    console.log(`📧 Email sent to ${to}: ${subject}`);
  } catch (err) {
    console.error("Email send error:", err);
  }
}

// ── 1. KYC Submitted → notify admin ─────────────────────────
exports.onKYCSubmitted = onDocumentUpdated(
  { document: "users/{userId}", region: "us-central1", secrets: [RESEND_API_KEY] },
  async (event) => {
    const before = event.data.before.data();
    const after  = event.data.after.data();
    if (before.kycStatus === after.kycStatus) return; // no change
    if (after.kycStatus !== "pending") return;
    after.email = await emailOf(event.params.userId, after.email || "");

    await sendEmail(RESEND_API_KEY.value(), {
      to: ADMIN_EMAIL,
      subject: `🔔 New KYC Application — ${esc(after.displayName || after.email)}`,
      html: `
        <h2>New Creator KYC Submitted</h2>
        <p><b>Name:</b> ${esc(after.displayName || "N/A")}</p>
        <p><b>Email:</b> ${esc(after.email || "N/A")}</p>
        <p><b>Username:</b> @${esc(after.username || "N/A")}</p>
        <p><b>Submitted:</b> ${new Date().toLocaleString()}</p>
        <p><a href="https://unlukt.com/admin/kyc" style="background:#e11d48;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;">Review Application →</a></p>
      `,
    });
  }
);

// ── 2. KYC Approved/Rejected → notify user ──────────────────
exports.onKYCDecision = onDocumentUpdated(
  { document: "users/{userId}", region: "us-central1", secrets: [RESEND_API_KEY] },
  async (event) => {
    const before = event.data.before.data();
    const after  = event.data.after.data();
    if (before.kycStatus === after.kycStatus) return;
    if (!["approved", "rejected"].includes(after.kycStatus)) return;
    after.email = await emailOf(event.params.userId, after.email || "");
    if (!after.email) return;

    const approved = after.kycStatus === "approved";
    await sendEmail(RESEND_API_KEY.value(), {
      to: after.email,
      subject: approved
        ? "🎉 Your Creator Application is Approved!"
        : "❌ Creator Application Update",
      html: approved ? `
        <h2>Welcome to the Creator Family! 🎉</h2>
        <p>Hi ${esc(after.displayName || "there")},</p>
        <p>Great news — your identity has been verified and your creator account is now <b>active</b>.</p>
        <p>You can now start publishing content, set subscription prices, and earn money from your fans.</p>
        <p><a href="https://unlukt.com/dashboard" style="background:#e11d48;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;">Go to Dashboard →</a></p>
        <p style="color:#888;font-size:12px;">The Unlukt Team</p>
      ` : `
        <h2>Application Status Update</h2>
        <p>Hi ${esc(after.displayName || "there")},</p>
        <p>Unfortunately, your creator application was <b>not approved</b> at this time.</p>
        ${after.kycRejectionReason ? `<p><b>Reason:</b> ${esc(after.kycRejectionReason)}</p>` : ""}
        <p>If you believe this is an error or would like to reapply, please contact our support team.</p>
        <p><a href="mailto:support@unlukt.com" style="background:#e11d48;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;">Contact Support</a></p>
        <p style="color:#888;font-size:12px;">The Unlukt Team</p>
      `,
    });
  }
);

// ── 2b. Creator approved → one of the first 50 becomes an Ambassador (keeps 90%) ──
exports.onCreatorApproved = onDocumentUpdated(
  { document: "users/{userId}", region: "us-central1" },
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (before.kycStatus === after.kycStatus || after.kycStatus !== "approved") return;
    const r = await require("./src/ambassador").grantFoundingAmbassador(admin.firestore(), event.params.userId);
    console.log(`Ambassador check for ${event.params.userId}:`, JSON.stringify(r));
  }
);

// ── 3. Withdrawal Requested → notify admin ───────────────────
exports.onWithdrawalRequested = onDocumentCreated(
  { document: "withdrawals/{wId}", region: "us-central1", secrets: [RESEND_API_KEY] },
  async (event) => {
    const w = event.data.data();
    if (!w) return;

    // Get user info
    let userEmail = w.email || "";
    let userName  = w.displayName || "Unknown";
    if (w.userId) {
      const uSnap = await admin.firestore().collection("users").doc(w.userId).get();
      if (uSnap.exists) {
        userEmail = (await emailOf(w.userId, uSnap.data().email || userEmail)) || userEmail;
        userName  = uSnap.data().displayName || userName;
      }
    }

    await sendEmail(RESEND_API_KEY.value(), {
      to: ADMIN_EMAIL,
      subject: `💸 Withdrawal Request — ${esc(userName)} ($${Number(w.amount || 0).toFixed(2)})`,
      html: `
        <h2>New Withdrawal Request</h2>
        <p><b>User:</b> ${esc(userName)} (${esc(userEmail)})</p>
        <p><b>Amount:</b> $${Number(w.amount || 0).toFixed(2)}</p>
        <p><b>Method:</b> ${esc(w.method || "N/A")} ${w.currency ? `(${esc(w.currency)})` : ""}</p>
        <p><b>Wallet/Account:</b> ${esc(w.walletAddress || w.accountNumber || "N/A")}</p>
        <p><b>Submitted:</b> ${new Date().toLocaleString()}</p>
        <p><a href="https://unlukt.com/admin" style="background:#e11d48;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;">Review in Admin →</a></p>
      `,
    });
  }
);

// Creator payout requested through the app (payouts/{id}) → email admin
exports.onPayoutRequested = onDocumentCreated(
  { document: "payouts/{pId}", region: "us-central1", secrets: [RESEND_API_KEY] },
  async (event) => {
    const p = event.data.data();
    if (!p) return;
    const uSnap = await admin.firestore().collection("users").doc(p.creatorId).get();
    const u = uSnap.exists ? uSnap.data() : {};
    const amount = (p.amountMinor || 0) / 100;
    await sendEmail(RESEND_API_KEY.value(), {
      to: ADMIN_EMAIL,
      subject: `💸 Payout Request — ${esc(u.displayName || u.username || p.creatorId)} ($${amount.toFixed(2)})`,
      html: `
        <h2>New Payout Request</h2>
        <p><b>Creator:</b> ${esc(u.displayName || "N/A")} (@${esc(u.username || "")}, ${esc(await emailOf(p.creatorId, u.email || ""))})</p>
        <p><b>Amount:</b> $${amount.toFixed(2)} (fee $${((p.networkFeeMinor || 0) / 100).toFixed(2)})</p>
        <p><b>USDT address:</b> ${esc(p.payoutAddress || "N/A")}</p>
        <p><a href="https://unlukt.com/admin/payouts" style="background:#e11d48;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;">Review payouts →</a></p>
      `,
    });
  }
);

// ── 4. Withdrawal Approved/Rejected → notify user ────────────
exports.onWithdrawalDecision = onDocumentUpdated(
  { document: "withdrawals/{wId}", region: "us-central1", secrets: [RESEND_API_KEY] },
  async (event) => {
    const before = event.data.before.data();
    const after  = event.data.after.data();
    if (before.status === after.status) return;
    if (!["approved", "completed", "rejected"].includes(after.status)) return;

    // Get user email
    let toEmail = after.email || "";
    let name    = after.displayName || "there";
    if (after.userId && !toEmail) {
      const uSnap = await admin.firestore().collection("users").doc(after.userId).get();
      if (uSnap.exists) {
        toEmail = await emailOf(after.userId, uSnap.data().email || "");
        name    = uSnap.data().displayName || name;
      }
    }
    if (!toEmail) return;

    const approved = ["approved", "completed"].includes(after.status);
    await sendEmail(RESEND_API_KEY.value(), {
      to: toEmail,
      subject: approved
        ? `✅ Withdrawal of $${Number(after.amount || 0).toFixed(2)} Approved`
        : `❌ Withdrawal Request Update`,
      html: approved ? `
        <h2>Your Withdrawal is Approved! ✅</h2>
        <p>Hi ${esc(name)},</p>
        <p>Your withdrawal of <b>$${Number(after.amount || 0).toFixed(2)}</b> has been approved and is being processed.</p>
        <p>Please allow 1–3 business days for the funds to arrive depending on your chosen method.</p>
        <p style="color:#888;font-size:12px;">The Unlukt Team</p>
      ` : `
        <h2>Withdrawal Request Update</h2>
        <p>Hi ${esc(name)},</p>
        <p>Your withdrawal request of <b>$${Number(after.amount || 0).toFixed(2)}</b> could not be processed at this time.</p>
        ${after.rejectionReason ? `<p><b>Reason:</b> ${esc(after.rejectionReason)}</p>` : ""}
        <p>Your balance has been restored. Please contact support if you have questions.</p>
        <p><a href="mailto:support@unlukt.com" style="background:#e11d48;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;">Contact Support</a></p>
        <p style="color:#888;font-size:12px;">The Unlukt Team</p>
      `,
    });
  }
);

// ── 5. Subscription Expiry Reminder (runs every 6 hours) ─────
exports.subscriptionExpiryReminder = onSchedule(
  { schedule: "every 6 hours", region: "us-central1", secrets: [RESEND_API_KEY] },
  async () => {
    const db = admin.firestore();
    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    // Find active subscriptions expiring within 48 hours
    const snap = await db.collection("subscriptions")
      .where("status", "==", "active")
      .where("expiresAt", "<=", in48h)
      .where("expiresAt", ">", now)
      .get();

    console.log(`⏰ Found ${snap.size} subscriptions expiring within 48h`);

    for (const doc of snap.docs) {
      const sub = doc.data();
      if (sub.reminderSent) continue; // don't double-send

      // Get subscriber info
      const userSnap = await db.collection("users").doc(sub.userId).get();
      if (!userSnap.exists) continue;
      const user = userSnap.data();
      if (!user.email) continue;

      // Get creator info
      const creatorSnap = await db.collection("users").doc(sub.creatorId).get();
      const creator = creatorSnap.exists ? creatorSnap.data() : {};
      const creatorName = creator.displayName || "your creator";

      const expiresAt = sub.expiresAt?.toDate?.() || new Date(sub.expiresAt);
      const hoursLeft = Math.round((expiresAt - now) / 3600000);

      await sendEmail(RESEND_API_KEY.value(), {
        to: user.email,
        subject: `⏳ Your subscription to ${creatorName} expires in ${hoursLeft}h`,
        html: `
          <h2>Your Subscription is Expiring Soon ⏳</h2>
          <p>Hi ${user.displayName || "there"},</p>
          <p>Your subscription to <b>${creatorName}</b> will expire in approximately <b>${hoursLeft} hours</b>.</p>
          <p>To keep enjoying their exclusive content, top up your wallet and renew your subscription before it expires.</p>
          <p><a href="https://unlukt.com/wallet" style="background:#e11d48;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;">Top Up Wallet →</a></p>
          <p style="color:#888;font-size:12px;">This reminder was sent because your subscription ends on ${expiresAt.toLocaleDateString()}.</p>
          <p style="color:#888;font-size:12px;">The Unlukt Team</p>
        `,
      });

      // Mark reminder as sent so it doesn't send again
      await doc.ref.update({ reminderSent: true });
    }
  }
);

// ========== STAGE CO-HOST REQUESTS (STRIPCHAT NON-REFUNDABLE STRATEGY) ==========
// requestCoHostStage removed — live guest requests are paid through the `spend` function (server price).
exports.requestCoHostStage = onRequest({ region: "us-central1" }, (req, res) => {
  res.status(410).json({ error: "Gone" });
});

// resolveCoHostRequest removed — live guest requests are paid through the `spend` function (server price).
exports.resolveCoHostRequest = onRequest({ region: "us-central1" }, (req, res) => {
  res.status(410).json({ error: "Gone" });
});

/**
 * Fan taps unlock on a message.
 * Atomic transaction: debit fan, credit creator net, credit platform fee.
 * Generates signed Bunny CDN URL with short expiration.
 */
exports.unlock = onCall(
  {
    region: "us-central1",
    secrets: [BUNNY_STORAGE_PASSWORD],
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in required");
    }

    const { conversationId, messageId, postId } = request.data || {};
    if (!postId && (!conversationId || !messageId)) {
      throw new HttpsError("invalid-argument", "Missing postId or (conversationId, messageId)");
    }

    const { unlockMessage, unlockPost } = require("./src/ledger");
    const { signBunnyUrl } = require("./src/bunny");

    // Case 1: Feed Post Unlock
    if (postId) {
      const result = await unlockPost({
        fanUid: request.auth.uid,
        postId,
      });
      return {
        success: true,
        alreadyUnlocked: result.alreadyUnlocked,
        postId: result.postId,
        txId: result.txId,
      };
    }

    // Case 2: Message Unlock
    const result = await unlockMessage({
      fanUid: request.auth.uid,
      conversationId,
      messageId,
    });

    // Tell the creator (new unlocks only)
    if (!result.alreadyUnlocked && result.txId) {
      try {
        const db = admin.firestore();
        const [led, fan] = await Promise.all([
          db.doc(`ledger/${result.txId}`).get(),
          db.doc(`users/${request.auth.uid}`).get(),
        ]);
        const creatorId = led.get("creatorId");
        const gross = (led.get("lines") || []).find((l) => String(l.account).startsWith("fan:"));
        if (creatorId) {
          await db.collection("notifications").add({
            userId: creatorId, type: "ppv_unlock", actorId: request.auth.uid,
            actorName: fan.get("displayName") || fan.get("username") || "A fan",
            actorAvatar: fan.get("profilePicture") || fan.get("avatar") || null,
            message: `unlocked your message${gross ? ` ($${(Math.abs(gross.deltaMinor) / 100).toFixed(2)})` : ""}`,
            conversationId, read: false, createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      } catch (e) { console.warn("PPV notify failed", e.message); }
    }

    // Real media URL (signed + expiring when BUNNY_TOKEN_KEY is set)
    let url = result.bunnyPath || "";
    if (url && !url.startsWith("http")) url = `${BUNNY_PULL_ZONE}/${url.replace(/^\//, "")}`;
    url = require("./src/media").signedUrl(url);

    return {
      url,
      alreadyUnlocked: result.alreadyUnlocked,
      txId: result.txId,
    };
  }
);

/**
 * Creator requests a payout.
 * Verifies address freeze and reserves funds in ledger under payout:pending.
 */
exports.requestPayout = onCall(
  {
    region: "us-central1",
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in required");
    }

    const { amountMinor, payoutAddress, networkFeeMinor } = request.data || {};
    const { requestPayout } = require("./src/ledger");

    return await requestPayout({
      creatorId: request.auth.uid,
      ownerUid: request.auth.uid,
      amountMinor: Number(amountMinor),
      payoutAddress,
      networkFeeMinor: networkFeeMinor ? Number(networkFeeMinor) : 100,
    });
  }
);

/**
 * Admin approves payout after manual USDT transfer on chain.
 * Settles payout:pending against external:crypto and external:network_fees.
 */
exports.approvePayout = onCall(
  {
    region: "us-central1",
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in required");
    }

    const db = admin.firestore();
    const callerSnap = await db.collection("users").doc(request.auth.uid).get();
    const isAdmin = callerSnap.exists && (callerSnap.get("isAdmin") === true || callerSnap.get("role") === "admin");
    if (!isAdmin) {
      throw new HttpsError("permission-denied", "Admin access required");
    }

    const { payoutId, txHash } = request.data || {};
    if (!payoutId || !txHash) {
      throw new HttpsError("invalid-argument", "payoutId and txHash required");
    }

    const { assertBalanced, payoutTxId } = require("./src/ledger-math");
    const payoutRef = db.doc(`payouts/${payoutId}`);

    return await db.runTransaction(async (tx) => {
      const pSnap = await tx.get(payoutRef);
      if (!pSnap.exists) throw new HttpsError("not-found", "Payout not found");
      const pData = pSnap.data();
      if (pData.status !== "requested") {
        throw new HttpsError("failed-precondition", `Payout status is ${pData.status}`);
      }

      const amountMinor = pData.amountMinor;
      const networkFeeMinor = pData.networkFeeMinor || 100;
      const netPayoutMinor = amountMinor - networkFeeMinor;

      const lines = [
        { account: "payout:pending", deltaMinor: -amountMinor },
        { account: "external:crypto", deltaMinor: netPayoutMinor },
        { account: "external:network_fees", deltaMinor: networkFeeMinor },
      ];
      assertBalanced(lines);

      const now = admin.firestore.FieldValue.serverTimestamp();
      const txId = payoutTxId(`${payoutId}_approved`);

      tx.set(db.doc(`ledger/${txId}`), {
        type: "payout_sent",
        lines,
        idempotencyKey: txId,
        createdAt: now,
      });

      // The reserved amount has left the platform — clear it from "pending payout"
      if (pData.creatorId) {
        tx.set(db.doc(`creator_balances/${pData.creatorId}`), {
          pendingPayoutBalance: admin.firestore.FieldValue.increment(-amountMinor / 100),
          updatedAt: now,
        }, { merge: true });
      }

      tx.update(payoutRef, {
        status: "sent",
        txHash,
        approvedBy: request.auth.uid,
        sentAt: now,
        updatedAt: now,
      });

      return { success: true, payoutId, status: "sent" };
    });
  }
);

/**
 * Admin rejects payout request. Reverses reserved funds back to creator.
 */
exports.rejectPayout = onCall(
  {
    region: "us-central1",
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in required");
    }

    const db = admin.firestore();
    const callerSnap = await db.collection("users").doc(request.auth.uid).get();
    const isAdmin = callerSnap.exists && (callerSnap.get("isAdmin") === true || callerSnap.get("role") === "admin");
    if (!isAdmin) {
      throw new HttpsError("permission-denied", "Admin access required");
    }

    const { payoutId, reason } = request.data || {};
    if (!payoutId) {
      throw new HttpsError("invalid-argument", "payoutId required");
    }

    const { assertBalanced, payoutTxId } = require("./src/ledger-math");
    const payoutRef = db.doc(`payouts/${payoutId}`);

    return await db.runTransaction(async (tx) => {
      const pSnap = await tx.get(payoutRef);
      if (!pSnap.exists) throw new HttpsError("not-found", "Payout not found");
      const pData = pSnap.data();
      if (pData.status !== "requested") {
        throw new HttpsError("failed-precondition", `Payout status is ${pData.status}`);
      }

      const amountMinor = pData.amountMinor;
      const creatorId = pData.creatorId;

      const lines = [
        { account: "payout:pending", deltaMinor: -amountMinor },
        { account: `creator:${creatorId}:available`, deltaMinor: amountMinor },
      ];
      assertBalanced(lines);

      const now = admin.firestore.FieldValue.serverTimestamp();
      const txId = payoutTxId(`${payoutId}_rejected`);

      tx.set(db.doc(`ledger/${txId}`), {
        type: "payout_rejected",
        lines,
        idempotencyKey: txId,
        createdAt: now,
      });

      // Restore shard
      tx.set(
        db.doc(`creatorEarnings/${creatorId}/shards/0`),
        { availableMinor: admin.firestore.FieldValue.increment(amountMinor) },
        { merge: true }
      );

      // Restore legacy creator_balances
      tx.set(
        db.doc(`creator_balances/${creatorId}`),
        {
          availableBalance: admin.firestore.FieldValue.increment(amountMinor / 100),
          pendingPayoutBalance: admin.firestore.FieldValue.increment(-amountMinor / 100),
          updatedAt: now,
        },
        { merge: true }
      );

      tx.update(payoutRef, {
        status: "rejected",
        rejectionReason: reason || "Rejected by admin",
        rejectedBy: request.auth.uid,
        updatedAt: now,
      });

      return { success: true, payoutId, status: "rejected" };
    });
  }
);

// ========== IN-APP PAYMENTS (server-side money) ==========
// The app says what the fan wants; the server sets the price, moves the money and writes the records.
const SPEND_KINDS = ["tip", "call", "subscription", "community", "live"];

exports.spend = onCall({ region: "us-central1", cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required");
  const uid = request.auth.uid;
  const data = request.data || {};
  if (!SPEND_KINDS.includes(data.kind)) throw new HttpsError("invalid-argument", "Unknown payment type");
  if (await overLimit(`spend_${uid}`, 60, 60 * 1000)) throw new HttpsError("resource-exhausted", "Too many payments — slow down a moment");
  const db = admin.firestore();
  const m = require("./src/money");
  switch (data.kind) {
    case "tip": return m.tip(db, uid, data);
    case "call": return m.bookCall(db, uid, data);
    case "subscription": return m.subscribe(db, uid, data);
    case "community": return m.joinCommunity(db, uid, data);
    case "live": return m.livePay(db, uid, data);
  }
  return null;
});

exports.refund = onCall({ region: "us-central1", cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required");
  const uid = request.auth.uid;
  const data = request.data || {};
  if (await overLimit(`refund_${uid}`, 30, 60 * 1000)) throw new HttpsError("resource-exhausted", "Too many requests");
  const db = admin.firestore();
  const m = require("./src/money");
  if (data.kind === "call") return m.refundCall(db, uid, data);
  if (data.kind === "live") return m.liveDecline(db, uid, data);
  throw new HttpsError("invalid-argument", "Unknown refund type");
});

exports.callStatus = onCall({ region: "us-central1", cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required");
  const { creatorId, bookingId, action } = request.data || {};
  const db = admin.firestore();
  const m = require("./src/money");
  if (action === "release") return m.releaseCall(db, request.auth.uid, { bookingId });
  if (!creatorId) throw new HttpsError("invalid-argument", "creatorId required");
  return m.creatorCallStatus(db, String(creatorId));
});

exports.claimAmbassador = onCall({ region: "us-central1", cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required");
  return require("./src/money").claimAmbassador(admin.firestore(), request.auth.uid);
});

exports.adminTopup = onCall({ region: "us-central1", cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required");
  const db = admin.firestore();
  const me = await db.doc(`users/${request.auth.uid}`).get();
  if (!(me.exists && (me.get("isAdmin") === true || me.get("role") === "admin"))) {
    throw new HttpsError("permission-denied", "Admin access required");
  }
  return require("./src/money").adminTopup(db, request.auth.uid, request.data || {});
});

// Admin report: sign-ups, funded wallets and paying fans for each ?src= link name
exports.sourceStats = onCall({ region: "us-central1", cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required");
  const db = admin.firestore();
  const me = await db.doc(`users/${request.auth.uid}`).get();
  if (!(me.exists && (me.get("isAdmin") === true || me.get("role") === "admin"))) {
    throw new HttpsError("permission-denied", "Admin access required");
  }
  return require("./src/sources").sourceStats(db, { sinceDays: (request.data || {}).sinceDays });
});

// ========== PAID MEDIA PROTECTION ==========
// Locked posts / PPV messages keep only a blurred preview in public docs; originals live in mediaPrivate.
const { onDocumentWritten } = require("firebase-functions/v2/firestore");

exports.protectPostMedia = onDocumentWritten(
  { document: "posts/{postId}", region: "us-central1", memory: "512MiB" },
  async (event) => {
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after = event.data.after.exists ? event.data.after.data() : null;
    // Keep users/{uid}.postCount current, so Discover never downloads every post just to count them
    const counted = (p) => !!p && !p.archived;
    const delta = (counted(after) ? 1 : 0) - (counted(before) ? 1 : 0);
    const owner = (after || before || {}).userId;
    if (delta && owner) {
      await admin.firestore().doc(`users/${owner}`)
        .set({ postCount: admin.firestore.FieldValue.increment(delta) }, { merge: true }).catch(() => {});
    }
    await require("./src/media").protectPost(event.params.postId, after);
  }
);

exports.protectMessageMedia = onDocumentCreated(
  { document: "conversations/{conversationId}/messages/{messageId}", region: "us-central1", memory: "512MiB" },
  async (event) => {
    await require("./src/media").protectMessage(event.params.conversationId, event.params.messageId, event.data.data());
  }
);

exports.getMedia = onCall({ region: "us-central1", cors: true }, async (request) => {
  const uid = request.auth ? request.auth.uid : null;
  if (uid && await overLimit(`media_${uid}`, 300, 60 * 1000)) throw new HttpsError("resource-exhausted", "Slow down");
  return require("./src/media").getMedia(uid, request.data || {});
});

exports.publishPost = onCall({ region: "us-central1", cors: true, memory: "512MiB" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required");
  if (await overLimit(`post_${request.auth.uid}`, 30, 60 * 60 * 1000)) throw new HttpsError("resource-exhausted", "Posting limit reached — try again later");
  return require("./src/media").publishPost(request.auth.uid, request.data || {});
});

exports.sendPPV = onCall({ region: "us-central1", cors: true, memory: "512MiB" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required");
  if (await overLimit(`ppv_${request.auth.uid}`, 60, 60 * 60 * 1000)) throw new HttpsError("resource-exhausted", "Too many messages — try again later");
  return require("./src/media").sendPPV(request.auth.uid, request.data || {});
});


// ========== SUBSCRIBER COUNT (server-owned) ==========
// subscribe() adds 1 when a sub becomes active; this removes 1 when an active sub is cancelled,
// expires or is refunded. Clients can no longer write subscribersCount at all.
exports.onSubscriptionChange = onDocumentUpdated(
  { document: "subscriptions/{subId}", region: "us-central1" },
  async (event) => {
    const before = event.data.before.data() || {};
    const after = event.data.after.data() || {};
    if (before.status === "active" && after.status !== "active" && after.creatorId) {
      await admin.firestore().doc(`users/${after.creatorId}`)
        .set({ subscribersCount: admin.firestore.FieldValue.increment(-1) }, { merge: true });
    }
  }
);

// ========== NO-SHOW REFUND SWEEP ==========
// Fans get their money back automatically when a booked call never started — even if nobody
// opens the waiting room (phone off, no data). Runs every 15 minutes.
exports.refundNoShowCalls = onSchedule(
  { schedule: "every 15 minutes", region: "us-central1", timeoutSeconds: 300 },
  async () => {
    const db = admin.firestore();
    const { refundCall } = require("./src/money");
    const toMs = (t) => (t && t.toMillis ? t.toMillis() : t && t.seconds ? t.seconds * 1000 : t ? new Date(t).getTime() : 0);
    const snap = await db.collection("call_bookings").where("status", "in", ["confirmed", "in_progress"]).get();
    const now = Date.now();
    let refunded = 0;
    for (const d of snap.docs) {
      const b = d.data();
      const endMs = toMs(b.scheduledAt) + ((b.duration || 30) + 10) * 60000; // slot + 10 min grace
      if (now < endMs) continue;
      const neverStarted = b.status === "confirmed" && !b.callStartedAt;
      const someoneNeverJoined = b.status === "in_progress" && (!b.userEnteredCallAt || !b.creatorEnteredCallAt);
      if (!neverStarted && !someoneNeverJoined) continue;
      if (!b.ledgerTxId && b.legacyVerified !== true) continue; // legacy: support handles by hand
      try {
        await refundCall(db, b.userId, { bookingId: d.id, reason: "Call never started" });
        refunded += 1;
      } catch (e) {
        console.warn(`No-show refund skipped for ${d.id}: ${e.message}`);
      }
    }
    console.log(`No-show sweep: ${refunded} refunded`);
  }
);
