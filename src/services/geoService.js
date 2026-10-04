// src/services/geoService.js - CREATOR GEO-BLOCKING ENGINE

export const ALL_COUNTRIES = [
  { code: 'US', name: 'United States', flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦' },
  { code: 'NG', name: 'Nigeria', flag: '🇳🇬' },
  { code: 'GH', name: 'Ghana', flag: '🇬🇭' },
  { code: 'KE', name: 'Kenya', flag: '🇰🇪' },
  { code: 'ZA', name: 'South Africa', flag: '🇿🇦' },
  { code: 'UG', name: 'Uganda', flag: '🇺🇬' },
  { code: 'TZ', name: 'Tanzania', flag: '🇹🇿' },
  { code: 'RW', name: 'Rwanda', flag: '🇷🇼' },
  { code: 'ZM', name: 'Zambia', flag: '🇿🇲' },
  { code: 'EG', name: 'Egypt', flag: '🇪🇬' },
  { code: 'MA', name: 'Morocco', flag: '🇲🇦' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪' },
  { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸' },
  { code: 'IT', name: 'Italy', flag: '🇮🇹' },
  { code: 'NL', name: 'Netherlands', flag: '🇳🇱' },
  { code: 'SE', name: 'Sweden', flag: '🇸🇪' },
  { code: 'NO', name: 'Norway', flag: '🇳🇴' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺' },
  { code: 'NZ', name: 'New Zealand', flag: '🇳🇿' },
  { code: 'BR', name: 'Brazil', flag: '🇧🇷' },
  { code: 'MX', name: 'Mexico', flag: '🇲🇽' },
  { code: 'CO', name: 'Colombia', flag: '🇨🇴' },
  { code: 'IN', name: 'India', flag: '🇮🇳' },
  { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪' },
  { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬' },
  { code: 'PH', name: 'Philippines', flag: '🇵🇭' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵' },
  { code: 'KR', name: 'South Korea', flag: '🇰🇷' },
  { code: 'CI', name: "Cote d'Ivoire", flag: '🇨🇮' },
  { code: 'SN', name: 'Senegal', flag: '🇸🇳' },
  { code: 'CM', name: 'Cameroon', flag: '🇨🇲' },
];

/**
 * Detect user's current country code (2-letter ISO)
 * Prioritizes user's saved profile location, then sessionStorage cache, then free IP lookup
 */
export const detectUserCountry = async (userProfile = null) => {
  try {
    // 1. Check user profile location
    if (userProfile?.location) {
      if (typeof userProfile.location === 'object' && userProfile.location.countryCode) {
        return userProfile.location.countryCode.toUpperCase();
      }
      if (typeof userProfile.location === 'string') {
        const match = ALL_COUNTRIES.find(c => 
          userProfile.location.toLowerCase().includes(c.name.toLowerCase()) ||
          userProfile.location.toLowerCase().includes(c.code.toLowerCase())
        );
        if (match) return match.code;
      }
    }

    // 2. Check session storage cache
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const cached = window.sessionStorage.getItem('unlukt_detected_country');
      if (cached) return cached.toUpperCase();
    }

    // 3. Lightweight IP lookup with 2.5s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const res = await fetch('https://api.country.is/', { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data?.country) {
        const countryCode = String(data.country).toUpperCase();
        if (typeof window !== 'undefined' && window.sessionStorage) {
          window.sessionStorage.setItem('unlukt_detected_country', countryCode);
        }
        return countryCode;
      }
    }
  } catch (err) {
    // Non-fatal, fallback to null
    console.warn('Could not determine user country via IP:', err.message);
  }

  return null;
};

/**
 * Checks if a creator has blocked a viewer from accessing their content based on location
 */
export const isUserGeoBlocked = (creatorData, viewerCountryCode, isOwnProfile = false) => {
  if (isOwnProfile) return false;
  if (!creatorData) return false;

  const isEnabled = creatorData.geoBlockingEnabled === true;
  if (!isEnabled) return false;

  const blockedList = Array.isArray(creatorData.blockedCountries) 
    ? creatorData.blockedCountries 
    : [];

  if (blockedList.length === 0 || !viewerCountryCode) return false;

  const normalizedViewerCode = String(viewerCountryCode).toUpperCase();
  return blockedList.some(code => String(code).toUpperCase() === normalizedViewerCode);
};

export default {
  ALL_COUNTRIES,
  detectUserCountry,
  isUserGeoBlocked,
};
