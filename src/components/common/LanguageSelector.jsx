// src/components/common/LanguageSelector.jsx
// Custom-styled Google Translate integration

import { useState, useEffect, useRef } from 'react';
import { Globe, ChevronDown, Check } from 'lucide-react';

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'pt', name: 'Português', flag: '🇧🇷' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'nl', name: 'Nederlands', flag: '🇳🇱' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
  { code: 'zh-CN', name: '中文', flag: '🇨🇳' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦' },
  { code: 'hi', name: 'हिन्दी', flag: '🇮🇳' },
  { code: 'tr', name: 'Türkçe', flag: '🇹🇷' },
  { code: 'pl', name: 'Polski', flag: '🇵🇱' },
  { code: 'sv', name: 'Svenska', flag: '🇸🇪' },
  { code: 'th', name: 'ไทย', flag: '🇹🇭' },
  { code: 'vi', name: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'id', name: 'Bahasa Indonesia', flag: '🇮🇩' },
  { code: 'yo', name: 'Yorùbá', flag: '🇳🇬' },
  { code: 'ha', name: 'Hausa', flag: '🇳🇬' },
  { code: 'ig', name: 'Igbo', flag: '🇳🇬' },
  { code: 'sw', name: 'Kiswahili', flag: '🇰🇪' },
  { code: 'zu', name: 'isiZulu', flag: '🇿🇦' },
];

// Load the Google Translate script once
let scriptLoaded = false;
function loadGoogleTranslateScript() {
  if (scriptLoaded) return;
  scriptLoaded = true;

  // Google Translate needs this callback
  window.googleTranslateElementInit = () => {
    new window.google.translate.TranslateElement(
      {
        pageLanguage: 'en',
        autoDisplay: false,
        includedLanguages: LANGUAGES.map(l => l.code).join(','),
      },
      'google_translate_element'
    );
  };

  const script = document.createElement('script');
  script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
  script.async = true;
  document.head.appendChild(script);
}

// Trigger translation by manipulating the hidden Google Translate select
function setLanguage(langCode) {
  const selectEl = document.querySelector('.goog-te-combo');
  if (selectEl) {
    selectEl.value = langCode;
    selectEl.dispatchEvent(new Event('change'));
  }
  // Save preference
  localStorage.setItem('preferredLanguage', langCode);
}

// Get currently active language
function getCurrentLanguage() {
  // Check saved preference first
  const saved = localStorage.getItem('preferredLanguage');
  if (saved) return saved;

  // Try to detect from Google Translate cookie
  const match = document.cookie.match(/googtrans=\/en\/([a-z-]+)/i);
  if (match) return match[1];

  return 'en';
}

export default function LanguageSelector({ variant = 'sidebar' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentLang, setCurrentLang] = useState('en');
  const dropdownRef = useRef(null);

  useEffect(() => {
    loadGoogleTranslateScript();
    setCurrentLang(getCurrentLanguage());
  }, []);

  // Auto-detect browser language on first visit
  useEffect(() => {
    const saved = localStorage.getItem('preferredLanguage');
    if (!saved) {
      const browserLang = navigator.language?.split('-')[0] || 'en';
      const supported = LANGUAGES.find(l => l.code === browserLang || l.code.startsWith(browserLang));
      if (supported && supported.code !== 'en') {
        // Wait for Google Translate to load, then translate
        const interval = setInterval(() => {
          const selectEl = document.querySelector('.goog-te-combo');
          if (selectEl) {
            setLanguage(supported.code);
            setCurrentLang(supported.code);
            clearInterval(interval);
          }
        }, 500);
        // Stop trying after 10 seconds
        setTimeout(() => clearInterval(interval), 10000);
      }
    }
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (langCode) => {
    setLanguage(langCode);
    setCurrentLang(langCode);
    setIsOpen(false);
  };

  const currentLangObj = LANGUAGES.find(l => l.code === currentLang) || LANGUAGES[0];

  // Sidebar variant — full width button
  if (variant === 'sidebar') {
    return (
      <div ref={dropdownRef} className="relative px-4 mt-2">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg font-medium transition text-gray-700 hover:bg-gray-50"
        >
          <Globe className="w-5 h-5" />
          <span className="flex-1 text-left">{currentLangObj.flag} {currentLangObj.name}</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <div className="absolute bottom-full left-4 right-4 mb-2 bg-white rounded-xl border border-gray-200 shadow-2xl max-h-64 overflow-y-auto z-50">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleSelect(lang.code)}
                className={`w-full flex items-center space-x-3 px-4 py-2.5 text-sm transition hover:bg-gray-50 ${
                  currentLang === lang.code ? 'bg-rose-50 text-rose-600 font-semibold' : 'text-gray-700'
                }`}
              >
                <span className="text-base">{lang.flag}</span>
                <span className="flex-1 text-left">{lang.name}</span>
                {currentLang === lang.code && <Check className="w-4 h-4 text-rose-500" />}
              </button>
            ))}
          </div>
        )}

        {/* Hidden Google Translate element */}
        <div id="google_translate_element" style={{ display: 'none' }} />
      </div>
    );
  }

  // Navbar variant — compact icon button
  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-1.5 px-3 py-2 rounded-lg hover:bg-gray-100 transition text-gray-700 text-sm font-medium"
        title="Change Language"
      >
        <span className="text-base">{currentLangObj.flag}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl border border-gray-200 shadow-2xl max-h-80 overflow-y-auto z-50">
          <div className="p-2">
            <p className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Language</p>
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleSelect(lang.code)}
                className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm transition ${
                  currentLang === lang.code
                    ? 'bg-rose-50 text-rose-600 font-semibold'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="text-base">{lang.flag}</span>
                <span className="flex-1 text-left">{lang.name}</span>
                {currentLang === lang.code && <Check className="w-4 h-4 text-rose-500" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Hidden Google Translate element */}
      <div id="google_translate_element" style={{ display: 'none' }} />
    </div>
  );
}
