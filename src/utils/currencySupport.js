// src/utils/currencySupport.js

// ✅ Minimal MVP list (add more anytime)
export const COUNTRIES = [
  { code: 'NG', name: 'Nigeria', currency: 'NGN' },
  { code: 'GH', name: 'Ghana', currency: 'GHS' },
  { code: 'KE', name: 'Kenya', currency: 'KES' },
  { code: 'ZA', name: 'South Africa', currency: 'ZAR' },
  { code: 'UG', name: 'Uganda', currency: 'UGX' },
  { code: 'TZ', name: 'Tanzania', currency: 'TZS' },
  { code: 'CI', name: "Côte d’Ivoire", currency: 'XOF' },
  { code: 'SN', name: 'Senegal', currency: 'XOF' },
  { code: 'CM', name: 'Cameroon', currency: 'XAF' },
  { code: 'GA', name: 'Gabon', currency: 'XAF' },
  { code: 'RW', name: 'Rwanda', currency: 'RWF' },
  { code: 'ZM', name: 'Zambia', currency: 'ZMW' },
  { code: 'EG', name: 'Egypt', currency: 'EGP' },
  { code: 'MA', name: 'Morocco', currency: 'MAD' },
  { code: 'TN', name: 'Tunisia', currency: 'TND' },

  // 👇 catch-all for unsupported / not listed
  { code: 'OTHER', name: 'Other / Not listed', currency: 'USD' }
];

// For your PaymentModal dropdown if you want names only:
export const COUNTRY_NAMES = COUNTRIES.map((c) => c.name);

// ✅ Currency support (bank transfer) – keep this list in sync with what your Korapay setup supports.
// Start small; expand when you confirm more currencies work in your Korapay account.
const KORAPAY_SUPPORTED_CURRENCIES = new Set([
  'NGN',
  'GHS',
  'KES',
  'ZAR',
  'UGX',
  'TZS',
  'XOF',
  'XAF'
]);

export const isKorapayCurrencySupported = (currency) => {
  const cur = String(currency || '').toUpperCase();
  return KORAPAY_SUPPORTED_CURRENCIES.has(cur);
};

export const getCountryByCode = (code) => {
  const c = String(code || '').toUpperCase();
  return COUNTRIES.find((x) => String(x.code).toUpperCase() === c) || null;
};

export const getCountryByName = (name) => {
  const n = String(name || '').toLowerCase();
  return COUNTRIES.find((x) => String(x.name).toLowerCase() === n) || null;
};

export const getCurrencyForCountry = (countryName) => {
  const c = getCountryByName(countryName);
  return c?.currency || 'USD';
};

// Optional helper (used by Wallet)
export const formatMoney = (amount, currency = 'USD') => {
  const value = Number(amount || 0);
  const cur = String(currency || 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: cur
    }).format(value);
  } catch {
    return `${cur} ${value.toFixed(2)}`;
  }
};
