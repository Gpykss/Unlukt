# 🔒 Security Configuration & Deployment Checklist

## 🚨 CRITICAL - Deploy Firestore Rules NOW

### Firestore Security Rules
**File:** `firestore.rules`

**Deploy to Firebase Console:**
1. Go to Firebase Console → Firestore Database → Rules
2. Copy contents of `firestore.rules`
3. Paste and click **Publish**

**Key Security Features:**
- ✅ Role-based access (User/Creator/Admin)
- ✅ Subscription verification before content access
- ✅ PPV message unlock validation
- ✅ Video call participant-only access
- ✅ Creator-only tier/availability management
- ✅ User can only create payments with their own userId
- ✅ Immutable unlocked content records
- ✅ Default deny-all at the end

**Note:** You're using Bunny.net CDN for all file storage (images, videos, payment proofs). Firebase Storage is NOT used in this project.

---

## 🔐 Environment Variables Security

### ❌ NEVER Commit These to Git
Add to `.gitignore`:
```
.env
.env.local
.env.production
```

### ✅ Current `.env` Configuration
```bash
# Firebase (PUBLIC - Safe for frontend)
VITE_FIREBASE_API_KEY=AIzaSyBz...
VITE_FIREBASE_AUTH_DOMAIN=unlukt.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=unlukt
VITE_FIREBASE_STORAGE_BUCKET=unlukt.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123...
VITE_FIREBASE_APP_ID=1:123...

# Crypto Payment
VITE_USDT_TRC20_ADDRESS=TWXh8n73LuT5MJ23pd8dCjFskRZckveFbP

# Agora.io (PUBLIC - Safe for frontend)
VITE_AGORA_APP_ID=your_agora_app_id_here

# Bunny.net CDN
VITE_BUNNY_CDN_URL=https://your-zone.b-cdn.net
```

### 🚨 CRITICAL: Backend Secrets (NOT IN FRONTEND)
These should ONLY be in your backend/admin SDK (Node.js server):
- Firebase Admin SDK private key
- Bunny.net API key/password
- Agora App Certificate (if using token auth)

---

## 🛡️ Additional Security Measures

### 1. Rate Limiting
**Status:** ⚠️ NOT IMPLEMENTED

**Recommendation:** Add Firebase App Check or Cloudflare
```bash
npm install firebase/app-check
```

Or use Cloud Functions with rate limiting for sensitive operations.

---

### 2. Content Moderation
**Status:** ⚠️ MANUAL ONLY

**Add:** 
- Automated NSFW detection API (e.g., Google Cloud Vision API)
- User report system with admin review queue
- Automated keyword/spam filtering

---

### 3. Payment Verification
**Status:** ✅ MANUAL VERIFICATION IN PLACE

**Current Flow:**
1. User uploads crypto payment proof
2. Admin manually verifies in Admin Panel
3. Payment marked as verified
4. Content/subscription unlocked

**Future Enhancement:** TronGrid API auto-verification
```javascript
// Check transaction on blockchain
const verifyTronTransaction = async (txHash) => {
  const response = await fetch(`https://api.trongrid.io/v1/transactions/${txHash}`);
  // Validate amount, recipient address, timestamp
};
```

---

### 4. Anti-Piracy Features
**Status:** ✅ IMPLEMENTED

- Screenshot blocking (PrintScreen, Windows+Shift+S, Cmd+Shift+4)
- Screen recording detection
- Dynamic watermarks (moves every 3 seconds)
- Right-click disabled on media
- DevTools detection

**Files:**
- `src/utils/antiPiracy.js`
- `src/hooks/useScreenProtection.js`

---

### 5. Input Validation
**Status:** ⚠️ PARTIAL

**Add to critical forms:**
```javascript
import DOMPurify from 'dompurify';

const sanitizeInput = (input) => {
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong'],
    ALLOWED_ATTR: []
  });
};
```

**Install:**
```bash
npm install dompurify
```

---

## 🚀 Pre-Production Deployment Checklist

### Firebase Configuration
- [ ] Deploy Firestore security rules
- [ ] Enable Firebase App Check (recommended)
- [ ] Set up Firebase Authentication email templates

### Bunny.net Configuration
- [ ] Configure CORS for your domain
- [ ] Set up access keys for upload API
- [ ] Enable pull zone for CDN delivery
- [ ] Configure video streaming settings

### Environment Setup
- [ ] Add `.env` to `.gitignore`
- [ ] Never commit API keys
- [ ] Use separate Firebase projects for dev/staging/prod
- [ ] Rotate crypto wallet addresses periodically

### Testing
- [ ] Test unauthorized access attempts (should fail)
- [ ] Test subscription expiry (content should lock)
- [ ] Test PPV unlock flow
- [ ] Test file upload limits (oversized files should reject)
- [ ] Test admin-only operations as regular user (should fail)

### Monitoring
- [ ] Set up Firebase usage alerts
- [ ] Monitor crypto payment wallet regularly
- [ ] Set up error tracking (Sentry, LogRocket)
- [ ] Create admin notification system for:
  - New KYC submissions
  - New payment verifications needed
  - Reported content
  - Payout requests

---

## 🔥 Known Vulnerabilities (From Previous Audit)

### ✅ FIXED:
- ~~Exposed Korapay secret in frontend~~ (removed, crypto-only now)
- ~~No security rules~~ (now implemented)
- ~~48+ console.logs exposing data~~ (replaced with logger.js)

### ⚠️ REMAINING:
1. **No rate limiting** - Add Firebase App Check or backend rate limiter
2. **Manual payment verification** - Consider TronGrid API integration
3. **No input sanitization** - Add DOMPurify to forms
4. **No automated content moderation** - Add NSFW API
5. **No email verification required** - Consider enabling in Firebase Auth

---

## 📞 Emergency Response

### If Private Keys/Secrets Are Exposed:
1. **Immediately rotate** all API keys in Firebase Console
2. **Generate new** Agora App ID
3. **Change** crypto wallet address (notify active users)
4. **Revoke** compromised Firebase Admin SDK keys
5. **Force logout** all users: Firebase Console → Authentication → Actions

### If Database is Breached:
1. **Immediately publish** restrictive Firestore rules (deny all)
2. **Export** current data for forensics
3. **Audit** recent access logs in Firebase Console
4. **Notify users** if personal data was accessed
5. **Reset** all user passwords via Firebase Auth

---

## 🧪 Security Testing Commands

### Test Firestore Rules Locally:
```bash
npm install -g firebase-tools
firebase emulators:start --only firestore
firebase emulators:exec --only firestore "npm test"
```

### Audit Dependencies:
```bash
npm audit
npm audit fix
```

### Check for Exposed Secrets:
```bash
# Install gitleaks
git clone https://github.com/gitleaks/gitleaks
cd gitleaks && make build

# Scan repository
./gitleaks detect --source ../ogfans --verbose
```

---

## 📚 Additional Resources

- [Firebase Security Rules Docs](https://firebase.google.com/docs/rules)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Agora Security Best Practices](https://docs.agora.io/en/video-calling/develop/authentication-workflow)
- [Content Security Policy Guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)

---

## ✅ Security Score: 7/10

**Strengths:**
- Comprehensive Firestore/Storage rules
- Anti-piracy features
- Manual payment verification
- No exposed secrets in code

**Needs Improvement:**
- Rate limiting (critical)
- Automated payment verification
- Input sanitization
- Content moderation
- Email verification enforcement
