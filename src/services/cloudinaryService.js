// src/services/cloudinaryService.js

const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'unlukt_uploads';

/**
 * Upload media file to Cloudinary
 * @param {File} file - Media file to upload
 * @param {string} folder - Folder name in Cloudinary
 * @param {function} onProgress - Progress callback (optional)
 * @returns {Promise<Object>} - Upload result with URL
 */
export const uploadMedia = async (file, folder = 'posts', onProgress = null,options = {}) => {
  try {
    if (!CLOUDINARY_CLOUD_NAME) {
      throw new Error('Cloudinary cloud name not configured. Add VITE_CLOUDINARY_CLOUD_NAME to .env');
    }

    // Create form data
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    formData.append('folder', folder);

    // Add tags if provided
if (options.tags && options.tags.length > 0) {
  formData.append('tags', options.tags.join(','));
}
    
    // Add resource type based on file type
    const fileType = file.type.split('/')[0];
    const resourceType = fileType === 'video' ? 'video' : 'image';

    // Upload URL
    const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`;

    console.log('📤 Uploading to Cloudinary...');

    // Create XMLHttpRequest to track progress
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Track upload progress
      if (onProgress) {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percentComplete = (e.loaded / e.total) * 100;
            onProgress(percentComplete);
          }
        });
      }

      // Handle completion
      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          console.log('✅ Upload successful:', response.secure_url);
          resolve({
            url: response.secure_url,
            publicId: response.public_id,
            format: response.format,
            width: response.width,
            height: response.height,
            duration: response.duration, // For videos
            resourceType: response.resource_type
          });
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      // Handle errors
      xhr.addEventListener('error', () => {
        reject(new Error('Upload failed'));
      });

      // Send request
      xhr.open('POST', uploadUrl);
      xhr.send(formData);
    });
  } catch (error) {
    console.error('❌ Error uploading to Cloudinary:', error);
    throw error;
  }
};

/**
 * Delete media from Cloudinary
 * @param {string} publicId - Cloudinary public ID
 * @param {string} resourceType - 'image' or 'video'
 * @returns {Promise<void>}
 */
export const deleteMedia = async (publicId, resourceType = 'image') => {
  try {
    // Note: Deletion requires authentication
    // You should implement this on your backend for security
    console.warn('⚠️ Delete functionality should be implemented on backend');
    
    // For now, we'll just log it
    console.log('🗑️ Request to delete:', publicId);
  } catch (error) {
    console.error('❌ Error deleting from Cloudinary:', error);
    throw error;
  }
};

/**
 * Generate optimized image URL
 * @param {string} url - Original Cloudinary URL
 * @param {Object} options - Transformation options
 * @returns {string} - Optimized URL
 */
export const getOptimizedUrl = (url, options = {}) => {
  const {
    width = null,
    height = null,
    crop = 'fill',
    quality = 'auto',
    format = 'auto'
  } = options;

  if (!url || !url.includes('cloudinary.com')) {
    return url;
  }

  // Build transformation string
  const transformations = [];
  
  if (width) transformations.push(`w_${width}`);
  if (height) transformations.push(`h_${height}`);
  if (crop) transformations.push(`c_${crop}`);
  if (quality) transformations.push(`q_${quality}`);
  if (format) transformations.push(`f_${format}`);

  const transformString = transformations.join(',');

  // Insert transformation into URL
  return url.replace('/upload/', `/upload/${transformString}/`);
};

/**
 * Generate thumbnail URL for video
 * @param {string} videoUrl - Cloudinary video URL
 * @param {number} width - Thumbnail width
 * @returns {string} - Thumbnail URL
 */
export const getVideoThumbnail = (videoUrl, width = 400) => {
  if (!videoUrl || !videoUrl.includes('cloudinary.com')) {
    return videoUrl;
  }

  // Replace video format with jpg and add transformation
  return videoUrl
    .replace('/video/upload/', `/video/upload/w_${width},c_fill,f_jpg/`)
    .replace(/\.(mp4|mov|avi|webm)$/, '.jpg');
};
