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
  
  // If it's a Cloudinary object, extract the URL. Locked (paid) media only has a blurred preview
  // until the viewer has access — see services/mediaService.js
  return imageData?.url || imageData?.secure_url || imageData?.previewUrl || null;
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

/**
 * Smaller image for feeds on slow / expensive data. Bunny Optimizer resizes on the fly when
 * `?width=` is present (ignored if Optimizer is off, so it's always safe). Signed links are
 * left untouched — changing them would break the signature.
 */
export const feedImage = (url, width = 900) => {
  if (!url || typeof url !== 'string') return url;
  if (!/\.b-cdn\.net\//i.test(url) || /[?&](token|expires)=/i.test(url)) return url;
  if (/\.(mp4|mov|webm|m4v|3gp)(\?|$)/i.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}width=${width}`;
};
