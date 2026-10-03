// src/utils/featureFlags.js

/**
 * Feature flag checker for Unlukt
 * Enables smooth dual-track rollout:
 * - VITE_NEW_UI=true in .env for local preview and development
 * - userProfile.newUi === true for phased rollout to selected creators in production
 */
export const isNewUIEnabled = (userProfile = null, feature = null) => {
  // If explicitly disabled via build-time env
  if (import.meta.env.VITE_NEW_UI === 'false') return false;

  // If user profile explicitly opted out of modern UI
  if (userProfile?.newUi === false || userProfile?.forceLegacy === true) return false;

  // If granular feature flag is explicitly false
  if (feature && userProfile?.featureFlags?.[feature] === false) return false;

  // Default to true so all creators get the modern dashboard, tiers, and withdrawals
  return true;
};

export const isNewDashboard = (userProfile) => isNewUIEnabled(userProfile, 'dashboard');
export const isNewNav = (userProfile) => isNewUIEnabled(userProfile, 'nav');
export const isNewOnboarding = (userProfile) => isNewUIEnabled(userProfile, 'onboarding');
export const isNewFeed = (userProfile) => isNewUIEnabled(userProfile, 'feed');
