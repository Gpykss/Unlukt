# 🚀 Deployment Steps - Get Unlukt Running

Follow these steps in order to get your platform live.

---

## ✅ Step 1: Firebase Project Setup

### A) Create Firebase Project (if not done)
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **"Add project"**
3. Enter name: `unlukt` (or your choice)
4. Disable Google Analytics (optional)
5. Click **Create project**

### B) Enable Required Services
1. **Authentication:**
   - Go to Authentication → Get Started
   - Enable **Email/Password** sign-in method
   
2. **Firestore Database:**
   - Go to Firestore Database → Create database
   - Start in **Production mode** (we'll add rules next)
   - Choose region closest to your users

3. **Functions:**
   - Will be enabled automatically when you deploy

---

## ✅ Step 2: Deploy Firestore Security Rules

### Copy Your Rules
1. Open `firestore.rules` file in your project
2. Go to Firebase Console → **Firestore Database** → **Rules**
3. Delete everything and paste contents from `firestore.rules`
4. Click **Publish**

**Test it:**
```
// Try accessing without auth - should fail
// Try accessing own data - should work
```

---

## ✅ Step 3: Set Up Bunny.net

### A) Create Account & Storage Zone
1. Go to [bunny.net](https://bunny.net)
2. Sign up for account
3. Go to **Storage** → **Add Storage Zone**
4. Settings:
   ```
   Name: unlukt
   Region: Choose closest to majority of users
   Replication: Enable (recommended)
   ```
5. Click **Create**

### B) Get Credentials
After creating storage zone:
1. Click on your storage zone
2. Copy these values:
   - **Storage Zone Name:** (e.g., "unlukt")
   - **Password/API Key:** (click "Show" button)
   - **Hostname:** storage.bunnycdn.com

### C) Create Pull Zone (CDN)
1. Go to **CDN** → **Add Pull Zone**
2. Link to your storage zone created above
3. Enable **HTTPS** (free)
4. Copy **Pull Zone URL** (e.g., `https://unlukt.b-cdn.net`)

---

## ✅ Step 4: Configure Environment Variables

### A) Local Development (`.env` file)
Update your `.env` file:

```bash
# Firebase Config (get from Firebase Console → Project Settings)
VITE_FIREBASE_API_KEY=AIzaSyBz...
VITE_FIREBASE_AUTH_DOMAIN=unlukt.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=unlukt
VITE_FIREBASE_STORAGE_BUCKET=unlukt.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123

# Crypto Payment
VITE_USDT_TRC20_ADDRESS=TWXh8n73LuT5MJ23pd8dCjFskRZckveFbP

# Agora (for video calls)
VITE_AGORA_APP_ID=your_agora_app_id_here

# Bunny.net CDN (PUBLIC - safe in frontend)
VITE_BUNNY_CDN_URL=https://unlukt.b-cdn.net
VITE_BUNNY_STORAGE_ZONE=unlukt

# Cloud Function URL (will get after deploying functions)
VITE_UPLOAD_ENDPOINT=https://us-central1-unlukt.cloudfunctions.net/createBunnyUpload
```

### B) Firebase Function Secrets (BACKEND ONLY)
**CRITICAL:** Never put Bunny API key in `.env` - it must be in Firebase Secrets!

```bash
# Install Firebase CLI (if not installed)
npm install -g firebase-tools

# Login to Firebase
firebase login

# Set Bunny password as secret
firebase functions:secrets:set BUNNY_STORAGE_PASSWORD
# Paste your Bunny.net API key/password when prompted
```

---

## ✅ Step 5: Update Cloud Function Config

Open `functions/index.js` and update these lines:

```javascript
// Line 15-17: Update with YOUR Bunny.net details
const BUNNY_STORAGE_ZONE = "unlukt"; // Your storage zone name
const BUNNY_STORAGE_HOST = "storage.bunnycdn.com"; // Usually this
const BUNNY_PULL_ZONE = "https://unlukt.b-cdn.net"; // Your CDN URL
```

---

## ✅ Step 6: Deploy Firebase Functions

### A) Install Dependencies
```bash
cd functions
npm install
cd ..
```

### B) Initialize Firebase (if not done)
```bash
firebase init
# Select:
# - Functions
# - Use existing project
# - Choose your project
# - JavaScript
# - ESLint: No
# - Install dependencies: Yes
```

### C) Deploy Functions
```bash
firebase deploy --only functions
```

**Wait for deployment...**

You'll get a URL like:
```
https://us-central1-unlukt.cloudfunctions.net/createBunnyUpload
```

### D) Update `.env` with Function URL
Add the URL you just got to `.env`:
```bash
VITE_UPLOAD_ENDPOINT=https://us-central1-YOUR-PROJECT-ID.cloudfunctions.net/createBunnyUpload
```

---

## ✅ Step 7: Set Up Agora.io (Video Calls)

### A) Create Agora Account
1. Go to [agora.io](https://www.agora.io)
2. Sign up and verify email
3. Go to **Project Management**

### B) Create Project
1. Click **Create**
2. Settings:
   ```
   Project Name: Unlukt Video Calls
   Use Case: Social
   Authentication: Testing mode (for now)
   ```
3. Copy **App ID**

### C) Add to `.env`
```bash
VITE_AGORA_APP_ID=your_app_id_here
```

---

## ✅ Step 8: Test Locally

### A) Install Dependencies
```bash
npm install
```

### B) Start Dev Server
```bash
npm run dev
```

### C) Test These Flows
1. **Sign up** → Should create user in Firebase Auth
2. **Upload avatar** → Should go to Bunny.net
3. **Create post** → Should store in Firestore + media on Bunny
4. **Make payment** → Should create crypto_payments record
5. **Subscribe to creator** → Should verify access to paid content

---

## ✅ Step 9: Deploy Frontend

### A) Build for Production
```bash
npm run build
```

### B) Deploy Options

#### Option 1: Firebase Hosting (Recommended)
```bash
# Initialize hosting
firebase init hosting
# Select:
# - Use existing project
# - Public directory: dist
# - Single-page app: Yes
# - GitHub actions: No

# Deploy
firebase deploy --only hosting
```

You'll get a URL like: `https://unlukt.web.app`

#### Option 2: Vercel
```bash
npm install -g vercel
vercel
# Follow prompts
```

#### Option 3: Netlify
1. Go to [netlify.com](https://netlify.com)
2. Drag & drop your `dist` folder
3. Done!

---

## ✅ Step 10: Production Environment Variables

### Set Production Vars in Hosting Platform

**For Firebase Hosting:**
No need - they're in your built files

**For Vercel/Netlify:**
Add all `VITE_*` variables in their dashboard:
- Settings → Environment Variables
- Add each variable from your `.env`

---

## ✅ Step 11: Post-Deployment Checklist

### Security
- [ ] Firestore rules deployed
- [ ] Bunny.net referer protection enabled (your domain only)
- [ ] Firebase Auth email templates customized
- [ ] Crypto wallet address verified in `.env`

### Functionality
- [ ] Can sign up new users
- [ ] Can upload images/videos
- [ ] Payments create database records
- [ ] Video calls work (Agora)
- [ ] Subscriptions lock/unlock content

### Monitoring
- [ ] Firebase usage alerts set up
- [ ] Bunny.net bandwidth alerts set up
- [ ] Error tracking (Sentry) installed (optional)

---

## 🚨 Common Issues & Fixes

### "Missing auth token" on upload
- Make sure user is logged in
- Check `VITE_UPLOAD_ENDPOINT` is correct
- Verify Firebase Function is deployed

### "CORS error" on upload
- Cloud Function has CORS enabled (it does)
- Check browser console for exact error

### "Payment proof not showing"
- Check Bunny.net CDN URL is correct
- Verify file was uploaded (check Bunny dashboard)
- Try adding `?v=123` to URL to bypass cache

### Video calls not connecting
- Verify `VITE_AGORA_APP_ID` is correct
- Check Agora dashboard for usage/errors
- Both users must be online

---

## 📞 Get Help

### Firebase
- [Firebase Console](https://console.firebase.google.com)
- [Firebase Docs](https://firebase.google.com/docs)

### Bunny.net
- [Bunny Dashboard](https://dash.bunny.net)
- [Bunny Docs](https://docs.bunny.net)

### Agora
- [Agora Console](https://console.agora.io)
- [Agora Docs](https://docs.agora.io)

---

## 🎉 You're Live!

Once all steps are complete:
1. Share your URL with beta testers
2. Monitor Firebase/Bunny dashboards
3. Fix bugs as they come up
4. Scale when ready!

**Current Status:** All code is ready, just needs deployment following these steps.
