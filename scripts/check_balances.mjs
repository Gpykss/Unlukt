import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDiW8lArJC-UGlnyUoOd9dP5c3Jt6LpH98",
  authDomain: "unlukt.com",
  projectId: "ogfans-2d4a6",
  storageBucket: "ogfans-2d4a6.firebasestorage.app",
  messagingSenderId: "309238019790",
  appId: "1:309238019790:web:f458cafd2fbb9b3386029f"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function inspect() {
  console.log('=== LATEST TRANSACTIONS ===');
  try {
    const txSnap = await getDocs(query(collection(db, 'transactions'), orderBy('createdAt', 'desc'), limit(10)));
    txSnap.forEach(d => console.log('TX:', d.id, JSON.stringify(d.data())));
  } catch (e) { console.error('TX err:', e.message); }

  console.log('\n=== LATEST PPV UNLOCKS ===');
  try {
    const ppvSnap = await getDocs(query(collection(db, 'ppv_unlocks'), orderBy('createdAt', 'desc'), limit(5)));
    ppvSnap.forEach(d => console.log('PPV:', d.id, JSON.stringify(d.data())));
  } catch (e) { console.error('PPV err:', e.message); }

  console.log('\n=== CREATOR BALANCES ===');
  try {
    const cSnap = await getDocs(collection(db, 'creator_balances'));
    cSnap.forEach(d => console.log('CREATOR_BAL:', d.id, JSON.stringify(d.data())));
  } catch (e) { console.error('CREATOR_BAL err:', e.message); }

  console.log('\n=== WALLETS ===');
  try {
    const wSnap = await getDocs(collection(db, 'wallets'));
    wSnap.forEach(d => console.log('WALLET:', d.id, JSON.stringify(d.data())));
  } catch (e) { console.error('WALLET err:', e.message); }

  console.log('\n=== USER BALANCES ===');
  try {
    const uSnap = await getDocs(collection(db, 'user_balances'));
    uSnap.forEach(d => console.log('USER_BAL:', d.id, JSON.stringify(d.data())));
  } catch (e) { console.error('USER_BAL err:', e.message); }
}

inspect().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
