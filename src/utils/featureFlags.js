// src/utils/featureFlags.js

/**
 * Feature flag checker for Unlukt
 * Enables smooth dual-track rollout:
 * - VITE_NEW_UI=true in .env for local preview and development
 * - userProfile.newUi === true for phased rollout to selected creators in production
 */
export const isNewUIEnabled = (userProfile = null, feature = null) => {
  // Global build-time toggle
  if (import.meta.env.VITE_NEW_UI === 'true') return true;

  if (!userProfile) return false;

  // Global user flag
  if (userProfile.newUi === true) return true;

  // Granular feature flags on user doc (e.g. userProfile.featureFlags = { dashboard: true })
  if (feature && userProfile.featureFlags?.[feature] === true) return true;

  return false;
};

export const isNewDashboard = (userProfile) => isNewUIEnabled(userProfile, 'dashboard');
export const isNewNav = (userProfile) => isNewUIEnabled(userProfile, 'nav');
export const isNewOnboarding = (userProfile) => isNewUIEnabled(userProfile, 'onboarding');
export const isNewFeed = (userProfile) => isNewUIEnabled(userProfile, 'feed');
