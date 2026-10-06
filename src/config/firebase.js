import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
// Remove or comment out analytics import
// import { getAnalytics } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);

// App Check: proves requests come from the real Unlukt app (blocks scripts hammering the API).
// Turns on when VITE_APPCHECK_SITE_KEY (reCAPTCHA Enterprise site key) is set in .env.
const appCheckKey = import.meta.env.VITE_APPCHECK_SITE_KEY;
if (appCheckKey) {
  try {
    initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(appCheckKey), isTokenAutoRefreshEnabled: true });
  } catch (e) {
    console.warn('App Check not started:', e?.message);
  }
}

export const auth = getAuth(app);
// Keep a local copy of data already downloaded (profiles, posts, chats) so reopening the app or a
// page doesn't download it all again — big saving on Nigerian mobile data, and the app still shows
// content during WiFi/network drops. Falls back to memory-only if the browser blocks IndexedDB.
const makeDb = () => {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      // Some Nigerian mobile networks/proxies break Firestore's streaming connection
      experimentalAutoDetectLongPolling: true,
    });
  } catch {
    return getFirestore(app);
  }
};
export const db = makeDb();
export const storage = getStorage(app);
export const functions = getFunctions(app, 'us-central1');
// Remove or comment out analytics export
// export const analytics = getAnalytics(app);

export default app;
