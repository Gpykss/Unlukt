// src/scripts/updateUserSchema.js
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

const updateAllUsers = async () => {
  try {
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(usersRef);
    
    console.log(`Updating ${snapshot.size} users...`);
    
    for (const userDoc of snapshot.docs) {
      const userData = userDoc.data();
      
      // Only update if fields don't exist
      const updates = {};
      
      if (!userData.hasOwnProperty('subscribersCount')) {
        updates.subscribersCount = 0;
      }
      
      if (!userData.hasOwnProperty('isCreator')) {
        updates.isCreator = userData.kycStatus === 'approved' || false;
      }
      
      if (!userData.hasOwnProperty('communitiesCount')) {
        updates.communitiesCount = 0;
      }
      
      if (!userData.hasOwnProperty('communitiesJoined')) {
        updates.communitiesJoined = 0;
      }
      
      if (Object.keys(updates).length > 0) {
        await updateDoc(userDoc.ref, updates);
        console.log(`✅ Updated user: ${userDoc.id}`);
      }
    }
    
    console.log('🎉 All users updated!');
  } catch (error) {
    console.error('Error updating users:', error);
  }
};

updateAllUsers();