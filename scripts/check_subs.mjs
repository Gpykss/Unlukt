import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

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

async function check() {
  console.log('Checking subscriptions...');
  try {
    const subsSnap = await getDocs(collection(db, 'subscriptions'));
    console.log(`Total subscriptions docs: ${subsSnap.size}`);
    subsSnap.forEach(d => {
      console.log('SUB DOC:', d.id, JSON.stringify(d.data()));
    });
  } catch (err) {
    console.error('Error fetching subscriptions:', err.message);
  }

  try {
    const txSnap = await getDocs(collection(db, 'subscription_transactions'));
    console.log(`Total subscription_transactions docs: ${txSnap.size}`);
    txSnap.forEach(d => {
      console.log('TX DOC:', d.id, JSON.stringify(d.data()));
    });
  } catch (err) {
    console.error('Error fetching subscription_transactions:', err.message);
  }

  try {
    const paySnap = await getDocs(collection(db, 'crypto_payments'));
    console.log(`Total crypto_payments docs: ${paySnap.size}`);
    let subCount = 0;
    paySnap.forEach(d => {
      const data = d.data();
      if (data.contentType === 'subscription' || data.type === 'subscription') {
        subCount++;
        console.log('CRYPTO SUB:', d.id, JSON.stringify(data));
      }
    });
    console.log(`Crypto subscription payments: ${subCount}`);
  } catch (err) {
    console.error('Error fetching crypto_payments:', err.message);
  }

  try {
    const ngnSnap = await getDocs(collection(db, 'ngn_payments'));
    console.log(`Total ngn_payments docs: ${ngnSnap.size}`);
    let subCount = 0;
    ngnSnap.forEach(d => {
      const data = d.data();
      if (data.type === 'subscription' || data.purpose === 'subscription') {
        subCount++;
        console.log('NGN SUB:', d.id, JSON.stringify(data));
      }
    });
    console.log(`NGN subscription payments: ${subCount}`);
  } catch (err) {
    console.error('Error fetching ngn_payments:', err.message);
  }
}

check().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
