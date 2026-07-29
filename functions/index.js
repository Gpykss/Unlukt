// functions/index.js
const admin = require("firebase-admin");
const cors = require("cors");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

admin.initializeApp();

const corsHandler = cors({ origin: true });

// ✅ SECRETS
const BUNNY_STORAGE_PASSWORD = defineSecret("BUNNY_STORAGE_PASSWORD");
const NOWPAYMENTS_API_KEY = defineSecret("NOWPAYMENTS_API_KEY");
const NOWPAYMENTS_IPN_SECRET = defineSecret("NOWPAYMENTS_IPN_SECRET");
const AGORA_APP_ID = defineSecret("AGORA_APP_ID");
const AGORA_APP_CERTIFICATE = defineSecret("AGORA_APP_CERTIFICATE");
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");

// ✅ NOT secrets (safe to hardcode)
const BUNNY_STORAGE_ZONE = "unlukt";
const BUNNY_STORAGE_HOST = "storage.bunnycdn.com";
const BUNNY_PULL_ZONE = "https://unlukt.b-cdn.net";

// ========== AGORA TOKEN GENERATION ==========
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
        if (isLivestream || channelName.startsWith("livestream_")) {
          const resolvedCreatorId = creatorId || channelName.replace("livestream_", "");

          if (uid === resolvedCreatorId) {
            role = RtcRole.PUBLISHER;
          } else {
            // Fan checks
            // Check if this fan is currently accepted as a co-host
            const cohostSnap = await db.collection("cohost_requests")
              .where("userId", "==", uid)
              .where("creatorId", "==", resolvedCreatorId)
              .where("status", "==", "accepted")
              .limit(1)
              .get();

            if (!cohostSnap.empty) {
              role = RtcRole.PUBLISHER; // Upgraded to publisher!
            } else {
              role = RtcRole.SUBSCRIBER;
            }

            // Check if user has an active, unexpired ticket for this room
            const now = new Date();
            const ticketsSnap = await db.collection("livestream_tickets")
              .where("userId", "==", uid)
              .where("creatorId", "==", resolvedCreatorId)
              .where("expiresAt", ">", now)
              .limit(1)
              .get();

            if (ticketsSnap.empty) {
              // No ticket. Try to transactionally purchase a 1-hour ticket block.
              // Fetch creator's pricing
              const creatorSnap = await db.collection("users").doc(resolvedCreatorId).get();
              if (!creatorSnap.exists) {
                return res.status(404).json({ error: "Creator profile not found" });
              }
              const creatorData = creatorSnap.data();
              // Default pricing: 10 Roses / USD
              const price = Number(creatorData.livestreamPrice || creatorData.ticketPrice || 10);

              // Perform transaction to deduct balance
              await db.runTransaction(async (transaction) => {
                const userBalRef = db.collection("user_balances").doc(uid);
                const creatorBalRef = db.collection("user_balances").doc(resolvedCreatorId);

                const userBalSnap = await transaction.get(userBalRef);
                if (!userBalSnap.exists || Number(userBalSnap.data().balance || 0) < price) {
                  throw new Error("INSUFFICIENT_FUNDS");
                }

                const currentBalance = Number(userBalSnap.data().balance || 0);
                const creatorBalSnap = await transaction.get(creatorBalRef);
                const currentCreatorBalance = creatorBalSnap.exists ? Number(creatorBalSnap.data().balance || 0) : 0;

                // Deduct from fan
                transaction.update(userBalRef, {
                  balance: currentBalance - price,
                  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });

                // Credit to creator immediately (non-refundable)
                if (creatorBalSnap.exists) {
                  transaction.update(creatorBalRef, {
                    balance: currentCreatorBalance + price,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                  });
                } else {
                  transaction.set(creatorBalRef, {
                    userId: resolvedCreatorId,
                    balance: price,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                  });
                }

                // Log debit transaction
                const debitRef = db.collection("transactions").doc();
                transaction.set(debitRef, {
                  userId: uid,
                  amount: -price,
                  type: "debit",
                  description: `Livestream 1-Hour Ticket: @${creatorData.username || "creator"}`,
                  balanceAfter: currentBalance - price,
                  createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });

                // Log credit transaction
                const creditRef = db.collection("transactions").doc();
                transaction.set(creditRef, {
                  userId: resolvedCreatorId,
                  amount: price,
                  type: "credit",
                  description: `Livestream 1-Hour Ticket Sale from fan`,
                  balanceAfter: currentCreatorBalance + price,
                  createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });

                // Create ticket document
                const ticketRef = db.collection("livestream_tickets").doc();
                transaction.set(ticketRef, {
                  userId: uid,
                  creatorId: resolvedCreatorId,
                  createdAt: admin.firestore.FieldValue.serverTimestamp(),
                  expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 60 * 60 * 1000)), // 1 hour
                });
              });
            }
          }
        } else {
          // 2. Regular 1-on-1 booking validation
          if (bookingId) {
            const bookingSnap = await db.collection("call_bookings").doc(bookingId).get();
            if (!bookingSnap.exists) {
              return res.status(404).json({ error: "Booking not found" });
            }
            const booking = bookingSnap.data();
            if (booking.userId !== uid && booking.creatorId !== uid) {
              return res.status(403).json({ error: "Not authorized for this booking" });
            }
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
        return res.status(500).json({ error: err?.message || "Server error" });
      }
    });
  }
);

// ========== BUNNY.NET UPLOAD ==========
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

        const safeName = String(fileName).replace(/[^\w.\-]/g, "_");
        const path = `uploads/${uid}/${Date.now()}_${safeName}`;
        const uploadUrl = `https://${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${path}`;
        const cdnUrl = `${BUNNY_PULL_ZONE}/${path}`;

        return res.status(200).json({
          uploadUrl,
          headers: {
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

      if (signature !== expectedSignature) {
        console.error('❌ Invalid webhook signature');
        return res.status(401).send('Invalid signature');
      }

      console.log('✅ Webhook signature verified');
      console.log('📩 NowPayments IPN body:', JSON.stringify(req.body, null, 2));

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
        await processPayment(db, paymentData, paymentDoc.id);
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
async function processPayment(db, paymentData, paymentId) {
  const { contentType, contentId, creatorId, userId, baseAmount, amount } = paymentData;

  try {
    const finalAmount = baseAmount || amount;
    console.log(`🔄 Processing ${contentType} payment for user ${userId}`);

    switch (contentType) {
      case "subscription":
        await db.collection("subscriptions").add({
          userId, creatorId, paymentId, amount: finalAmount,
          paymentType: "crypto", status: "active",
          startedAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        });
        break;

      case "unlock":
        await db.collection("unlocked_content").add({
          userId, contentId, creatorId, paymentId, amount: finalAmount,
          paymentType: "crypto",
          unlockedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        break;

      case "topup":
        const userBalanceRef = db.collection("user_balances").doc(userId);
        const userBalanceDoc = await userBalanceRef.get();
        let newBalance = finalAmount;
        if (userBalanceDoc.exists) {
          newBalance = (userBalanceDoc.data().balance || 0) + finalAmount;
          await userBalanceRef.update({
            balance: newBalance,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } else {
          await userBalanceRef.set({
            userId, balance: finalAmount,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        // Log transaction history
        await db.collection("transactions").add({
          userId,
          amount: finalAmount,
          type: "topup",
          description: "Wallet top-up (Crypto)",
          paymentId: paymentId || null,
          balanceAfter: newBalance,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        break;

      case "tip":
        await db.collection("tips").add({
          fromUserId: userId, toCreatorId: creatorId, paymentId,
          amount: finalAmount, paymentType: "crypto",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        break;
    }

    if (creatorId) {
      const creatorBalanceRef = db.collection("creator_balances").doc(creatorId);
      const creatorBalanceDoc = await creatorBalanceRef.get();
      const creatorEarning = finalAmount * 0.85;

      if (creatorBalanceDoc.exists) {
        await creatorBalanceRef.update({
          pendingBalance: (creatorBalanceDoc.data().pendingBalance || 0) + creatorEarning,
          totalEarnings: (creatorBalanceDoc.data().totalEarnings || 0) + creatorEarning,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        await creatorBalanceRef.set({
          creatorId, availableBalance: 0,
          pendingBalance: creatorEarning, totalEarnings: creatorEarning,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
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
    minInstances: 1,
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

      const { amount, contentId, contentType, creatorId, userEmail, userName, userCountry } = req.body;
      if (!amount || !contentType) return res.status(400).json({ error: "Missing required fields" });

      const reference = `CRYPTO_${Date.now()}_${uid.substring(0, 8)}`;

      const baseAmount = parseFloat(amount);
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
      return res.status(500).json({ error: error.message || "Server error" });
    }
  }
);

const Busboy = require("busboy");

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

          busboy.on("file", (_, file, info) => {
            mimeType = info.mimeType;
            originalName = info.filename;
            const chunks = [];
            file.on("data", (d) => chunks.push(d));
            file.on("end", () => (buffer = Buffer.concat(chunks)));
          });

          busboy.on("finish", () => buffer ? resolve({ buffer, mimeType, originalName }) : reject(new Error("No file")));
          busboy.on("error", reject);
          const { Readable } = require("stream");
          const readable = new Readable();
          readable.push(req.rawBody);
          readable.push(null);
          readable.pipe(busboy);
        });

        const safeName = fileBuffer.originalName.replace(/[^\w.\-]/g, "_");
        const path = `uploads/${uid}/${Date.now()}_${safeName}`;
        const uploadUrl = `https://${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${path}`;

        const bunnyRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { AccessKey: BUNNY_STORAGE_PASSWORD.value(), "Content-Type": fileBuffer.mimeType },
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
        return res.status(500).json({ error: err.message || "Server error" });
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
        return res.status(500).json({ error: err?.message || "Server error" });
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

        await admin.auth().verifyIdToken(token);

        const { email, displayName } = req.body;
        if (!email) return res.status(400).json({ error: "Missing email" });

        const name = displayName || "there";
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
        return res.status(500).json({ error: err?.message || "Server error" });
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
        
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: "Missing email" });

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
    region: "us-central1",
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

// ========== AMBASSADOR COMMISSION ON PAYOUT ==========
exports.onPayoutComplete = onDocumentCreated(
  {
    document: "transactions/{txId}",
    region: "us-central1",
  },
  async (event) => {
    try {
      const snapshot = event.data;
      if (!snapshot) return;

      const tx = snapshot.data();
      const db = admin.firestore();

      // Only process completed/approved payouts
      if (!['completed', 'approved', 'paid'].includes(tx.status)) {
        console.log(`⏭ Skipping transaction — status: ${tx.status}`);
        return;
      }

      if (!tx.creatorId || !tx.amount) {
        console.log("⏭ Skipping — missing creatorId or amount");
        return;
      }

      // Get the creator
      const creatorSnap = await db.collection("users").doc(tx.creatorId).get();
      if (!creatorSnap.exists) return;
      const creator = { id: creatorSnap.id, ...creatorSnap.data() };

      // Check referral
      if (!creator.referredBy) {
        console.log(`ℹ️ Creator ${creator.id} has no referredBy — no commission`);
        return;
      }

      // Get the ambassador
      const ambassadorSnap = await db.collection("users").doc(creator.referredBy).get();
      if (!ambassadorSnap.exists) return;
      const ambassador = { id: ambassadorSnap.id, ...ambassadorSnap.data() };

      // Check 1-year referral expiry (from creator.createdAt)
      const creatorCreatedAt = creator.createdAt?.toDate?.() || new Date(creator.createdAt);
      const expiresAt = new Date(creatorCreatedAt);
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);

      if (new Date() > expiresAt) {
        console.log(`⏭ Referral expired for creator ${creator.id}`);
        return;
      }

      const commissionRate = ambassador.referralCommissionRate || 0.05;
      const commission = tx.amount * commissionRate;

      console.log(`💰 Commission: $${commission.toFixed(2)} (${commissionRate * 100}%) for ambassador ${ambassador.id}`);

      // Add to ambassador's balance
      await db.collection("users").doc(ambassador.id).update({
        ambassadorBalance: admin.firestore.FieldValue.increment(commission),
        totalCommissionEarned: admin.firestore.FieldValue.increment(commission),
      });

      // Create commission record
      await db.collection("referralCommissions").add({
        ambassadorId: ambassador.id,
        referredCreatorId: creator.id,
        transactionId: event.params.txId,
        amount: commission,
        commissionRate,
        status: "pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt,
      });

      console.log(`✅ Commission recorded for ambassador ${ambassador.id}`);
    } catch (err) {
      console.error("onPayoutComplete error:", err);
    }
  }
);

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

    await sendEmail(RESEND_API_KEY.value(), {
      to: ADMIN_EMAIL,
      subject: `🔔 New KYC Application — ${after.displayName || after.email}`,
      html: `
        <h2>New Creator KYC Submitted</h2>
        <p><b>Name:</b> ${after.displayName || "N/A"}</p>
        <p><b>Email:</b> ${after.email || "N/A"}</p>
        <p><b>Username:</b> @${after.username || "N/A"}</p>
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
    if (!after.email) return;

    const approved = after.kycStatus === "approved";
    await sendEmail(RESEND_API_KEY.value(), {
      to: after.email,
      subject: approved
        ? "🎉 Your Creator Application is Approved!"
        : "❌ Creator Application Update",
      html: approved ? `
        <h2>Welcome to the Creator Family! 🎉</h2>
        <p>Hi ${after.displayName || "there"},</p>
        <p>Great news — your identity has been verified and your creator account is now <b>active</b>.</p>
        <p>You can now start publishing content, set subscription prices, and earn money from your fans.</p>
        <p><a href="https://unlukt.com/dashboard" style="background:#e11d48;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;">Go to Dashboard →</a></p>
        <p style="color:#888;font-size:12px;">The Unlukt Team</p>
      ` : `
        <h2>Application Status Update</h2>
        <p>Hi ${after.displayName || "there"},</p>
        <p>Unfortunately, your creator application was <b>not approved</b> at this time.</p>
        ${after.kycRejectionReason ? `<p><b>Reason:</b> ${after.kycRejectionReason}</p>` : ""}
        <p>If you believe this is an error or would like to reapply, please contact our support team.</p>
        <p><a href="mailto:support@unlukt.com" style="background:#e11d48;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;">Contact Support</a></p>
        <p style="color:#888;font-size:12px;">The Unlukt Team</p>
      `,
    });
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
        userEmail = uSnap.data().email || userEmail;
        userName  = uSnap.data().displayName || userName;
      }
    }

    await sendEmail(RESEND_API_KEY.value(), {
      to: ADMIN_EMAIL,
      subject: `💸 Withdrawal Request — ${userName} ($${Number(w.amount || 0).toFixed(2)})`,
      html: `
        <h2>New Withdrawal Request</h2>
        <p><b>User:</b> ${userName} (${userEmail})</p>
        <p><b>Amount:</b> $${Number(w.amount || 0).toFixed(2)}</p>
        <p><b>Method:</b> ${w.method || "N/A"} ${w.currency ? `(${w.currency})` : ""}</p>
        <p><b>Wallet/Account:</b> ${w.walletAddress || w.accountNumber || "N/A"}</p>
        <p><b>Submitted:</b> ${new Date().toLocaleString()}</p>
        <p><a href="https://unlukt.com/admin" style="background:#e11d48;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;">Review in Admin →</a></p>
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
        toEmail = uSnap.data().email || "";
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
        <p>Hi ${name},</p>
        <p>Your withdrawal of <b>$${Number(after.amount || 0).toFixed(2)}</b> has been approved and is being processed.</p>
        <p>Please allow 1–3 business days for the funds to arrive depending on your chosen method.</p>
        <p style="color:#888;font-size:12px;">The Unlukt Team</p>
      ` : `
        <h2>Withdrawal Request Update</h2>
        <p>Hi ${name},</p>
        <p>Your withdrawal request of <b>$${Number(after.amount || 0).toFixed(2)}</b> could not be processed at this time.</p>
        ${after.rejectionReason ? `<p><b>Reason:</b> ${after.rejectionReason}</p>` : ""}
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
exports.requestCoHostStage = onRequest(
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

        const authHeader = req.headers.authorization || "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
        if (!token) return res.status(401).json({ error: "Missing auth token" });

        const decoded = await admin.auth().verifyIdToken(token);
        const uid = decoded.uid;

        const { creatorId, tipAmount } = req.body || {};
        if (!creatorId) return res.status(400).json({ error: "creatorId is required" });
        
        const price = Number(tipAmount || 50);

        const db = admin.firestore();
        const creatorSnap = await db.collection("users").doc(creatorId).get();
        if (!creatorSnap.exists) {
          return res.status(404).json({ error: "Creator profile not found" });
        }
        const creatorData = creatorSnap.data();

        const fanSnap = await db.collection("users").doc(uid).get();
        const fanData = fanSnap.exists ? fanSnap.data() : {};
        const fanUsername = fanData.username || "fan";
        const fanDisplayName = fanData.displayName || fanUsername;

        await db.runTransaction(async (transaction) => {
          const userBalRef = db.collection("user_balances").doc(uid);
          const creatorBalRef = db.collection("user_balances").doc(creatorId);

          const userBalSnap = await transaction.get(userBalRef);
          if (!userBalSnap.exists || Number(userBalSnap.data().balance || 0) < price) {
            throw new Error("INSUFFICIENT_FUNDS");
          }

          const currentBalance = Number(userBalSnap.data().balance || 0);
          const creatorBalSnap = await transaction.get(creatorBalRef);
          const currentCreatorBalance = creatorBalSnap.exists ? Number(creatorBalSnap.data().balance || 0) : 0;

          transaction.update(userBalRef, {
            balance: currentBalance - price,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          if (creatorBalSnap.exists) {
            transaction.update(creatorBalRef, {
              balance: currentCreatorBalance + price,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          } else {
            transaction.set(creatorBalRef, {
              userId: creatorId,
              balance: price,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }

          const debitRef = db.collection("transactions").doc();
          transaction.set(debitRef, {
            userId: uid,
            amount: -price,
            type: "debit",
            description: `Stage Request Tip to @${creatorData.username || "creator"} (Non-Refundable)`,
            balanceAfter: currentBalance - price,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          const creditRef = db.collection("transactions").doc();
          transaction.set(creditRef, {
            userId: creatorId,
            amount: price,
            type: "credit",
            description: `Stage Request Tip from @${fanUsername}`,
            balanceAfter: currentCreatorBalance + price,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          const cohostRef = db.collection("cohost_requests").doc();
          transaction.set(cohostRef, {
            userId: uid,
            username: fanUsername,
            displayName: fanDisplayName,
            avatar: fanData.profilePicture || fanData.avatar || "",
            creatorId,
            amount: price,
            status: "pending",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        });

        console.log(`✅ Co-host request submitted by user: ${uid} for creator: ${creatorId}`);
        return res.status(200).json({ success: true });

      } catch (err) {
        console.error("requestCoHostStage error:", err);
        if (err.message === "INSUFFICIENT_FUNDS") {
          return res.status(402).json({ error: "INSUFFICIENT_FUNDS" });
        }
        return res.status(500).json({ error: err?.message || "Server error" });
      }
    });
  }
);

exports.resolveCoHostRequest = onRequest(
  {
    region: "us-central1",
  },
  (req, res) => {
    corsHandler(req, res, async () => {
      try {
        if (req.method !== "POST") {
          return res.status(405).json({ error: "Method not allowed" });
        }

        const authHeader = req.headers.authorization || "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
        if (!token) return res.status(401).json({ error: "Missing auth token" });

        const decoded = await admin.auth().verifyIdToken(token);
        const uid = decoded.uid;

        const { requestId, action } = req.body || {};
        if (!requestId || !action) {
          return res.status(400).json({ error: "requestId and action are required" });
        }

        const db = admin.firestore();
        const requestRef = db.collection("cohost_requests").doc(requestId);
        const requestSnap = await requestRef.get();

        if (!requestSnap.exists) {
          return res.status(404).json({ error: "Stage request not found" });
        }

        const requestData = requestSnap.data();
        if (requestData.creatorId !== uid) {
          return res.status(403).json({ error: "Not authorized to resolve this request" });
        }

        if (action === "accept") {
          await requestRef.update({
            status: "accepted",
            resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          console.log(`✅ Co-host request accepted: ${requestId}`);
        } else if (action === "dismiss") {
          await requestRef.update({
            status: "dismissed",
            resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          console.log(`✅ Co-host request dismissed: ${requestId}`);
        } else {
          return res.status(400).json({ error: "Invalid action. Must be 'accept' or 'dismiss'" });
        }

        return res.status(200).json({ success: true });

      } catch (err) {
        console.error("resolveCoHostRequest error:", err);
        return res.status(500).json({ error: err?.message || "Server error" });
      }
    });
  }
);