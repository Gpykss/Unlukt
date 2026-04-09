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

        const { channelName, bookingId } = req.body || {};
        if (!channelName) return res.status(400).json({ error: "channelName is required" });

        // Verify user belongs to this booking
        if (bookingId) {
          const bookingSnap = await admin.firestore()
            .collection("call_bookings")
            .doc(bookingId)
            .get();

          if (!bookingSnap.exists) {
            return res.status(404).json({ error: "Booking not found" });
          }

          const booking = bookingSnap.data();
          if (booking.userId !== uid && booking.creatorId !== uid) {
            return res.status(403).json({ error: "Not authorized for this booking" });
          }
        }

        // Generate token using Agora token builder
        const { RtcTokenBuilder, RtcRole } = require("agora-token");

        const appId = AGORA_APP_ID.value().trim();
        const appCertificate = AGORA_APP_CERTIFICATE.value().trim();
        const role = RtcRole.PUBLISHER;
        const expirationTimeInSeconds = 3600; // 1 hour
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

        // Use numeric UID derived from Firebase UID
        const numericUid = 0; // 0 = Agora assigns UID automatically

        const agoraToken = RtcTokenBuilder.buildTokenWithUid(
          appId,
          appCertificate,
          channelName,
          numericUid,
          role,
          privilegeExpiredTs,
          privilegeExpiredTs
        );

        console.log(`✅ Agora token generated for channel: ${channelName}, user: ${uid}`);

        return res.status(200).json({
          token: agoraToken,
          appId,
          channelName,
          uid: numericUid,
          expiresAt: privilegeExpiredTs,
        });

      } catch (err) {
        console.error("getAgoraToken error:", err);
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

      await paymentDocRef.update({
        status:               newStatus,
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
      });

      console.log(`✅ Payment ${paymentDoc.id} updated to status: ${newStatus}`);

      if (payment_status === 'finished' || payment_status === 'confirmed') {
        if (paymentData.status === 'completed') {
          console.log(`⚠️  Payment ${paymentDoc.id} already processed — skipping`);
          return res.status(200).send('OK');
        }
        await processPayment(db, paymentData, paymentDoc.id);
        console.log(`🎉 Payment ${paymentDoc.id} fully processed`);
      }

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
        if (userBalanceDoc.exists) {
          await userBalanceRef.update({
            balance: (userBalanceDoc.data().balance || 0) + finalAmount,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } else {
          await userBalanceRef.set({
            userId, balance: finalAmount,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
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

      let vatAmount = 0, vatPercentage = 0, baseAmount = parseFloat(amount);
      if (userCountry === "Nigeria") {
        vatPercentage = 1.5;
        baseAmount = amount / 1.015;
        vatAmount = amount - baseAmount;
      }

      const nowPaymentResponse = await fetch("https://api.nowpayments.io/v1/invoice", {
        method: "POST",
        headers: { "x-api-key": NOWPAYMENTS_API_KEY.value(), "Content-Type": "application/json" },
        body: JSON.stringify({
          price_amount: parseFloat(amount),
          price_currency: "usd",
          pay_currency: "usdttrc20",
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
        creatorId: creatorId || null, amount: parseFloat(amount),
        baseAmount, vatAmount, vatPercentage, currency: "USD",
        cryptoCurrency: "USDT", network: "TRC20", paymentMethod: "nowpayments",
        status: "pending_payment", userCountry: userCountry || "Unknown",
        nowPaymentsUrl: nowPaymentData.invoice_url,
        nowPaymentsStatus: nowPaymentData.payment_status || "waiting",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        metadata: { platform: "unlukt", source: "web", hasVAT: vatAmount > 0 },
      });

      return res.status(200).json({
        success: true, paymentId: docRef.id, reference,
        paymentUrl: nowPaymentData.invoice_url, amount: parseFloat(amount),
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
          from: "Unlukt Support <support@unlukt.com>",
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
          from: "Unlukt Team <support@unlukt.com>",
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
          from: "Unlukt Security <support@unlukt.com>",
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

const { onDocumentCreated } = require("firebase-functions/v2/firestore");

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
        from: "Unlukt Team <support@unlukt.com>",
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