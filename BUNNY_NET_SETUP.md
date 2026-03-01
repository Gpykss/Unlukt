# 🐰 Bunny.net CDN Setup Guide

## Why Bunny.net?
You're using Bunny.net for **ALL file storage** in Unlukt:
- ✅ Creator posts (images/videos)
- ✅ Payment proof screenshots
- ✅ Profile avatars & banners
- ✅ PPV locked media
- ✅ Community images
- ✅ KYC documents

**Firebase Storage is NOT used** - everything goes to Bunny.net.

---

## 📋 Setup Checklist

### 1. Create Bunny.net Account
1. Go to [bunny.net](https://bunny.net)
2. Sign up and verify email
3. Navigate to **Storage** → **Add Storage Zone**

### 2. Create Storage Zone
```
Name: unlukt-media (or your choice)
Region: Choose closest to your users
  - US: New York, LA, or Miami
  - EU: London, Frankfurt
  - Asia: Singapore, Tokyo
Replication: Enable (for global CDN)
```

### 3. Get Your Credentials
After creating storage zone:
```
Storage Zone Name: unlukt-media
Hostname: storage.bunnycdn.com
Password/API Key: [Copy from dashboard]
```

Add to `.env`:
```bash
VITE_BUNNY_STORAGE_ZONE=unlukt-media
VITE_BUNNY_HOSTNAME=storage.bunnycdn.com
VITE_BUNNY_CDN_URL=https://unlukt-media.b-cdn.net
# DO NOT put API key in frontend - use backend only
```

### 4. Create Pull Zone (CDN)
1. Go to **CDN** → **Add Pull Zone**
2. Link to your storage zone
3. Enable **HTTPS** (free SSL)
4. Copy CDN URL (e.g., `https://unlukt-media.b-cdn.net`)

---

## 🔐 Security Configuration

### A) Enable Access Control
**Dashboard → Storage Zone → Security:**
- ✅ Enable **Token Authentication** for private content
- ✅ Set **Allowed Referers** to your domain only
- ✅ Block hotlinking from other sites

### B) File Access Rules
```javascript
// Public files (avatars, banners, free posts)
https://unlukt-media.b-cdn.net/avatars/user123/avatar.jpg

// Private files (PPV, paid posts) - add token
https://unlukt-media.b-cdn.net/ppv/msg456/image.jpg?token=GENERATED_TOKEN
```

### C) Token Authentication (For Private Content)
You'll need a **backend function** to generate signed URLs:

```javascript
// Backend function (NOT in frontend)
import crypto from 'crypto';

function generateBunnyToken(path, expiresInSeconds = 3600) {
  const securityKey = process.env.BUNNY_SECURITY_KEY; // From dashboard
  const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
  
  const hashableBase = `${securityKey}${path}${expires}`;
  const token = crypto
    .createHash('sha256')
    .update(hashableBase)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  return `${path}?token=${token}&expires=${expires}`;
}

// Usage
const signedUrl = generateBunnyToken('/ppv/message123/locked.jpg');
// Returns: /ppv/message123/locked.jpg?token=abc123&expires=1234567890
```

---

## 📤 Upload Files to Bunny.net

### Frontend Upload Flow
```javascript
// src/services/bunnyUploadService.js
export async function uploadToBunny(file, folder = 'posts') {
  const formData = new FormData();
  formData.append('file', file);
  
  // Call YOUR backend endpoint
  const response = await fetch('/api/upload-to-bunny', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${userToken}`
    },
    body: formData
  });
  
  const { url, path } = await response.json();
  return url; // https://unlukt-media.b-cdn.net/posts/abc123.jpg
}
```

### Backend Upload Endpoint (Node.js/Express)
```javascript
// api/upload-to-bunny.js
import axios from 'axios';
import FormData from 'form-data';

app.post('/api/upload-to-bunny', upload.single('file'), async (req, res) => {
  const file = req.file;
  const userId = req.user.uid; // From auth middleware
  
  const storageZone = process.env.BUNNY_STORAGE_ZONE;
  const apiKey = process.env.BUNNY_API_KEY;
  const fileName = `${Date.now()}_${file.originalname}`;
  const path = `posts/${userId}/${fileName}`;
  
  try {
    // Upload to Bunny.net
    await axios.put(
      `https://storage.bunnycdn.com/${storageZone}/${path}`,
      file.buffer,
      {
        headers: {
          'AccessKey': apiKey,
          'Content-Type': file.mimetype
        }
      }
    );
    
    const cdnUrl = `https://${storageZone}.b-cdn.net/${path}`;
    
    res.json({ 
      success: true, 
      url: cdnUrl,
      path 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

---

## 🎥 Video Streaming Configuration

### Enable Stream for Videos
1. Dashboard → Pull Zone → **Video**
2. Enable **MP4 Fallback**
3. Enable **Thumbnail Generation**
4. Set resolutions: 360p, 480p, 720p, 1080p

### Adaptive Streaming
Bunny.net automatically generates HLS streams:
```
Original: https://unlukt-media.b-cdn.net/videos/video.mp4
HLS: https://unlukt-media.b-cdn.net/videos/video.mp4/playlist.m3u8
```

Use in video player:
```jsx
<video controls>
  <source src={`${videoUrl}/playlist.m3u8`} type="application/x-mpegURL" />
  <source src={videoUrl} type="video/mp4" /> {/* Fallback */}
</video>
```

---

## 💰 Pricing Estimate

**Storage:**
- $0.01/GB stored per month
- 10GB = $0.10/month

**Bandwidth:**
- $0.01-0.03/GB delivered (varies by region)
- 100GB/month = $1-3/month

**Average for small platform:**
- 50GB storage + 500GB bandwidth = ~$5-10/month

**Much cheaper than Firebase Storage!**

---

## 🔧 Folder Structure

Organize files by type and user:
```
unlukt-media/
├── avatars/
│   └── {userId}/
│       └── avatar.jpg
├── banners/
│   └── {userId}/
│       └── banner.jpg
├── posts/
│   └── {userId}/
│       ├── {postId}_image1.jpg
│       └── {postId}_video1.mp4
├── ppv/
│   └── {conversationId}/
│       └── {messageId}_locked.jpg
├── payment_proofs/
│   └── {userId}/
│       └── {paymentId}_proof.png
├── kyc/
│   └── {userId}/
│       └── id_document.jpg
└── communities/
    └── {communityId}/
        └── cover.jpg
```

---

## 🛡️ Security Best Practices

### 1. Never Expose API Key in Frontend
❌ **BAD:**
```javascript
// NEVER DO THIS
const apiKey = 'abc123-your-bunny-api-key';
```

✅ **GOOD:**
```javascript
// Upload through YOUR backend
await fetch('/api/upload', { /* file data */ });
```

### 2. Token-Protect Private Content
- Payment proofs: Token required
- PPV locked media: Token required
- Paid posts: Token required
- KYC documents: Token + admin check

### 3. Set Allowed Referers
Dashboard → Storage → Security:
```
yourdomain.com
*.yourdomain.com
```
Prevents other sites from hotlinking your content.

### 4. Enable DDoS Protection
Dashboard → Pull Zone → Security:
- ✅ Enable **Rate Limiting**
- ✅ Enable **Bot Protection**
- ✅ Block regions you don't serve (optional)

---

## 📊 Monitoring

### Check Usage
Dashboard → Storage Zone → Statistics:
- Files stored
- Bandwidth used
- Request count
- Top files

### Set Up Alerts
Dashboard → Account → Notifications:
- Email when bandwidth exceeds limit
- Email when storage exceeds limit

---

## 🚨 Troubleshooting

### Upload Fails (403 Forbidden)
- Check API key is correct
- Check path doesn't have special characters
- Try removing leading slash from path

### File Not Loading (404)
- Check CDN URL format: `https://zone-name.b-cdn.net/path`
- NOT: `https://storage.bunnycdn.com/path`
- Wait 1-2 minutes for CDN propagation

### CORS Errors
Dashboard → Pull Zone → Routing:
- Enable **CORS Headers**
- Add your domain to allowed origins

### Slow Video Loading
- Enable **MP4 Fallback** in video settings
- Use HLS streaming for large videos
- Enable **Thumbnail Preload**

---

## ✅ Production Checklist

Before going live:
- [ ] Enable token authentication for private content
- [ ] Set allowed referers to your domain
- [ ] Enable HTTPS (should be default)
- [ ] Configure video streaming settings
- [ ] Set up bandwidth alerts
- [ ] Test uploads from backend
- [ ] Test signed URL generation
- [ ] Verify CORS headers
- [ ] Enable DDoS protection
- [ ] Set up billing alerts

---

## 🔗 Resources

- [Bunny.net Dashboard](https://dash.bunny.net)
- [Upload API Docs](https://docs.bunny.net/reference/storage-api)
- [Token Authentication Guide](https://docs.bunny.net/docs/stream-security)
- [Video Streaming Docs](https://docs.bunny.net/docs/stream)

---

**Your current setup:** Bunny.net for ALL files + Firebase for database only.

This is the optimal architecture for a content platform! 🚀
