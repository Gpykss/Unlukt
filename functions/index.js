// functions/index.js
const admin = require("firebase-admin");
const cors = require("cors");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

admin.initializeApp();

const corsHandler = cors({ origin: true });

// ✅ SECRETS (stored in Firebase Secrets)
const BUNNY_STORAGE_PASSWORD = defineSecret("BUNNY_STORAGE_PASSWORD");
const NOWPAYMENTS_API_KEY = defineSecret("NOWPAYMENTS_API_KEY");

// ✅ NOT secrets (safe to hardcode)
const BUNNY_STORAGE_ZONE = "unlukt";
const BUNNY_STORAGE_HOST = "storage.bunnycdn.com";
const BUNNY_PULL_ZONE = "https://unlukt.b-cdn.net";

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
// In functions/index.js - Update nowpaymentsWebhook function

const NOWPAYMENTS_IPN_SECRET = defineSecret("NOWPAYMENTS_IPN_SECRET"); // ADD THIS AT TOP

exports.nowpaymentsWebhook = onRequest(
  {
    region: "us-central1",
    secrets: [NOWPAYMENTS_API_KEY, NOWPAYMENTS_IPN_SECRET], // ADD IPN SECRET
  },
  async (req, res) => {
    try {
      if (req.method !== "POST") {
        return res.status(405).send("Method Not Allowed");
      }

      // ✅ VERIFY SIGNATURE
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

      // ... rest of webhook code stays the same
    } catch (error) {
      console.error("❌ Webhook error:", error);
      return res.status(500).send("Internal Server Error");
    }
  }
);

// Helper function to sort object keys
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
    const finalAmount = baseAmount || amount; // Use amount before VAT

    console.log(`🔄 Processing ${contentType} payment for user ${userId}`);

    switch (contentType) {
      case "subscription":
        await db.collection("subscriptions").add({
          userId,
          creatorId,
          paymentId,
          amount: finalAmount,
          paymentType: "crypto",
          status: "active",
          startedAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        });
        console.log(`✅ Subscription created for user ${userId}`);
        break;

      case "unlock":
        await db.collection("unlocked_content").add({
          userId,
          contentId,
          creatorId,
          paymentId,
          amount: finalAmount,
          paymentType: "crypto",
          unlockedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`✅ Content ${contentId} unlocked for user ${userId}`);
        break;

      case "topup":
        const userBalanceRef = db.collection("user_balances").doc(userId);
        const userBalanceDoc = await userBalanceRef.get();

        if (userBalanceDoc.exists) {
          const currentBalance = userBalanceDoc.data().balance || 0;
          await userBalanceRef.update({
            balance: currentBalance + finalAmount,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } else {
          await userBalanceRef.set({
            userId,
            balance: finalAmount,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        console.log(`✅ Balance topped up for user ${userId}`);
        break;

      case "tip":
        await db.collection("tips").add({
          fromUserId: userId,
          toCreatorId: creatorId,
          paymentId,
          amount: finalAmount,
          paymentType: "crypto",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`✅ Tip sent from ${userId} to ${creatorId}`);
        break;
    }

    // Update creator balance if applicable
    if (creatorId) {
      const creatorBalanceRef = db.collection("creator_balances").doc(creatorId);
      const creatorBalanceDoc = await creatorBalanceRef.get();

      const platformFee = finalAmount * 0.15; // 15% platform fee
      const creatorEarning = finalAmount - platformFee;

      if (creatorBalanceDoc.exists) {
        const currentPending = creatorBalanceDoc.data().pendingBalance || 0;
        const currentTotal = creatorBalanceDoc.data().totalEarnings || 0;

        await creatorBalanceRef.update({
          pendingBalance: currentPending + creatorEarning,
          totalEarnings: currentTotal + creatorEarning,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        await creatorBalanceRef.set({
          creatorId,
          availableBalance: 0,
          pendingBalance: creatorEarning,
          totalEarnings: creatorEarning,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      console.log(`✅ Creator ${creatorId} earned $${creatorEarning.toFixed(2)}`);
    }

    // Send notification to user
    await db.collection("notifications").add({
      userId,
      type: "payment_verified",
      message: "Your payment has been confirmed!",
      paymentId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      read: false,
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
    cors: true, // Enable CORS
  },
  async (req, res) => {
    // Handle CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
      return res.status(204).send('');
    }

    try {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
      }

      // Verify user is authenticated
      const authHeader = req.headers.authorization || "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

      if (!token) {
        return res.status(401).json({ error: "Missing auth token" });
      }

      const decoded = await admin.auth().verifyIdToken(token);
      const uid = decoded.uid;

      const {
        amount,
        contentId,
        contentType,
        creatorId,
        userEmail,
        userName,
        userCountry,
      } = req.body;

      if (!amount || !contentType) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const reference = `CRYPTO_${Date.now()}_${uid.substring(0, 8)}`;

      // Calculate VAT
      let vatAmount = 0;
      let vatPercentage = 0;
      let baseAmount = parseFloat(amount);

      if (userCountry === "Nigeria") {
        vatPercentage = 1.5;
        baseAmount = amount / 1.015;
        vatAmount = amount - baseAmount;
      }

      console.log("🔵 Creating NOWPayments invoice...");

      // ✅ SECURE: API call happens on backend
      const nowPaymentResponse = await fetch(
        "https://api.nowpayments.io/v1/invoice",
        {
          method: "POST",
          headers: {
            "x-api-key": NOWPAYMENTS_API_KEY.value(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            price_amount: parseFloat(amount),
            price_currency: "usd",
            pay_currency: "usdttrc20",
            order_id: reference,
            order_description: `${contentType} - ${userName}`,
            success_url: `${req.headers.origin || 'https://your-domain.com'}/payment-success?ref=${reference}`,
            cancel_url: `${req.headers.origin || 'https://your-domain.com'}/wallet`,
          }),
        }
      );

      if (!nowPaymentResponse.ok) {
        const errorData = await nowPaymentResponse.json();
        console.error("❌ NOWPayments error:", errorData);
        return res.status(500).json({ error: errorData.message || "Payment creation failed" });
      }

      const nowPaymentData = await nowPaymentResponse.json();

      console.log("✅ NOWPayments invoice created:", nowPaymentData.id);

      // Save to Firestore
      const db = admin.firestore();
      const paymentRecord = {
        reference,
        nowPaymentsId: nowPaymentData.id,
        userId: uid,
        userEmail,
        userName,
        contentId: contentId || null,
        contentType,
        creatorId: creatorId || null,

        amount: parseFloat(amount),
        baseAmount,
        vatAmount,
        vatPercentage,

        currency: "USD",
        cryptoCurrency: "USDT",
        network: "TRC20",
        paymentMethod: "nowpayments",
        status: "pending_payment",

        userCountry: userCountry || "Unknown",

        nowPaymentsUrl: nowPaymentData.invoice_url,
        nowPaymentsStatus: nowPaymentData.payment_status || "waiting",

        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),

        metadata: {
          platform: "unlukt",
          source: "web",
          hasVAT: vatAmount > 0,
        },
      };

      const docRef = await db.collection("crypto_payments").add(paymentRecord);

      console.log("✅ Payment record created:", docRef.id);

      return res.status(200).json({
        success: true,
        paymentId: docRef.id,
        reference,
        paymentUrl: nowPaymentData.invoice_url,
        amount: parseFloat(amount),
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
  },
  (req, res) => {
    corsHandler(req, res, async () => {
      try {
        if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

        // Auth check
        const token = (req.headers.authorization || "").replace("Bearer ", "");
        if (!token) return res.status(401).json({ error: "Missing auth token" });
        const decoded = await admin.auth().verifyIdToken(token);
        const uid = decoded.uid;

        // Parse multipart form
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
          req.pipe(busboy);
        });

        // Upload to Bunny
        const safeName = fileBuffer.originalName.replace(/[^\w.\-]/g, "_");
        const path = `uploads/${uid}/${Date.now()}_${safeName}`;
        const uploadUrl = `https://${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${path}`;

        const bunnyRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            AccessKey: BUNNY_STORAGE_PASSWORD.value(),
            "Content-Type": fileBuffer.mimeType,
          },
          body: fileBuffer.buffer,
        });

        if (!bunnyRes.ok) {
          const err = await bunnyRes.text();
          throw new Error(`Bunny upload failed: ${err}`);
        }

        const cdnUrl = `${BUNNY_PULL_ZONE}/${path}`;

        return res.status(200).json({
          success: true,
          cdnUrl,
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