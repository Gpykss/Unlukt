// src/utils/imageHelpers.js

/**
 * Extract URL from image data (handles both string URLs and Cloudinary objects)
 */
export const getImageUrl = (imageData) => {
  if (!imageData) return null;
  
  // If it's already a string URL, return it
  if (typeof imageData === 'string') {
    return imageData;
  }
  
  // If it's a Cloudinary object, extract the URL
  return imageData?.url || imageData?.secure_url || null;
};

/**
 * Get the first image URL from a post (checks both images and media fields)
 */
export const getPostImage = (post) => {
  if (!post) return null;
  
  // Check images field
  if (post.images && post.images.length > 0) {
    return getImageUrl(post.images[0]);
  }
  
  // Check media field as fallback
  if (post.media && post.media.length > 0) {
    return getImageUrl(post.media[0]);
  }
  
  return null;
};

/**
 * Get all image URLs from a post
 */
export const getAllPostImages = (post) => {
  if (!post) return [];
  
  const images = post.images || post.media || [];
  return images.map(img => getImageUrl(img)).filter(Boolean);
};
