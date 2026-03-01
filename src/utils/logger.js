// src/utils/logger.js - Production-safe logging utility

const isDevelopment = import.meta.env.MODE === 'development';

/**
 * Conditional logger that only logs in development
 * Usage: logger.info('Message'), logger.error('Error'), logger.debug('Debug')
 */
export const logger = {
  info: (...args) => {
    if (isDevelopment) {
      console.log('[INFO]', ...args);
    }
  },
  
  error: (...args) => {
    // Always log errors (even in production)
    console.error('[ERROR]', ...args);
  },
  
  warn: (...args) => {
    if (isDevelopment) {
      console.warn('[WARN]', ...args);
    }
  },
  
  debug: (...args) => {
    if (isDevelopment) {
      console.log('[DEBUG]', ...args);
    }
  },
  
  success: (...args) => {
    if (isDevelopment) {
      console.log('[SUCCESS] ✅', ...args);
    }
  }
};

export default logger;
