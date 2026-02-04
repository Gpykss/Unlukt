import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../config/firebase';

/**
 * Upload ID document to Firebase Storage
 */
export const uploadIDDocument = async (userId, file, documentType) => {
  try {
    // Create a unique filename
    const timestamp = Date.now();
    const filename = `kyc/${userId}/${documentType}_${timestamp}_${file.name}`;
    const storageRef = ref(storage, filename);
    
    // Upload file
    const snapshot = await uploadBytes(storageRef, file, {
      contentType: file.type,
      customMetadata: {
        uploadedBy: userId,
        documentType: documentType,
        uploadedAt: new Date().toISOString()
      }
    });
    
    // Get download URL
    const downloadURL = await getDownloadURL(snapshot.ref);
    
    console.log('✅ Document uploaded successfully');
    return {
      url: downloadURL,
      path: filename,
      type: documentType,
      uploadedAt: timestamp
    };
  } catch (error) {
    console.error('❌ Error uploading document:', error);
    throw error;
  }
};

/**
 * Upload selfie photo
 */
export const uploadSelfiePhoto = async (userId, file) => {
  try {
    const timestamp = Date.now();
    const filename = `kyc/${userId}/selfie_${timestamp}_${file.name}`;
    const storageRef = ref(storage, filename);
    
    const snapshot = await uploadBytes(storageRef, file, {
      contentType: file.type,
      customMetadata: {
        uploadedBy: userId,
        documentType: 'selfie',
        uploadedAt: new Date().toISOString()
      }
    });
    
    const downloadURL = await getDownloadURL(snapshot.ref);
    
    console.log('✅ Selfie uploaded successfully');
    return {
      url: downloadURL,
      path: filename,
      uploadedAt: timestamp
    };
  } catch (error) {
    console.error('❌ Error uploading selfie:', error);
    throw error;
  }
};

/**
 * Delete document from storage
 */
export const deleteDocument = async (filePath) => {
  try {
    const storageRef = ref(storage, filePath);
    await deleteObject(storageRef);
    console.log('✅ Document deleted');
  } catch (error) {
    console.error('❌ Error deleting document:', error);
    throw error;
  }
};