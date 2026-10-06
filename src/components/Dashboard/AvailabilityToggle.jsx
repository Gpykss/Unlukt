// src/components/Dashboard/AvailabilityToggle.jsx - Call Availability Manager

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Video, Mic, DollarSign, ToggleLeft, ToggleRight, Loader2, Sliders, ChevronDown, ChevronUp } from 'lucide-react';
import { getCreatorAvailability, updateCreatorAvailability, MINIMUM_VIDEO_PRICE, MINIMUM_VOICE_PRICE } from '../../services/videoCallService';
import { useAuth } from '../../hooks/useAuth';
import logger from '../../utils/logger';

export default function AvailabilityToggle({ compact = false }) {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showRates, setShowRates] = useState(false);
  const [availability, setAvailability] = useState({
    status: 'offline',
    videoCallPrice: 5,
    voiceCallPrice: 3,
    callsEnabled: false
  });

  useEffect(() => {
    if (currentUser) {
      loadAvailability();
    }
  }, [currentUser]);

  const loadAvailability = async () => {
    try {
      setLoading(true);
      const data = await getCreatorAvailability(currentUser.uid);
      setAvailability(data);
    } catch (error) {
      logger.error('Error loading availability:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleAvailability = async () => {
    try {
      setSaving(true);
      const newStatus = availability.status === 'available' ? 'offline' : 'available';
      
      const updated = await updateCreatorAvailability(currentUser.uid, {
        ...availability,
        status: newStatus,
        callsEnabled: newStatus === 'available'
      });
      
      setAvailability(updated);
    } catch (error) {
      logger.error('Error toggling availability:', error);
      alert('Failed to update availability');
    } finally {
      setSaving(false);
    }
  };

  // Draft text while typing — the box is free to edit (clear it, type 25, etc.).
  // The price is only validated + saved when you leave the field or press Enter.
  const [drafts, setDrafts] = useState({});
  const [priceNote, setPriceNote] = useState('');
  const FIELD = { video: 'videoCallPrice', voice: 'voiceCallPrice', livestream: 'livestreamPrice' };
  const MIN = { video: MINIMUM_VIDEO_PRICE, voice: MINIMUM_VOICE_PRICE, livestream: 1 };
  const DEFAULT = { video: MINIMUM_VIDEO_PRICE, voice: MINIMUM_VOICE_PRICE, livestream: 10 };

  const priceInputProps = (type) => ({
    type: 'number',
    inputMode: 'decimal',
    min: MIN[type],
    step: type === 'livestream' ? 1 : 0.5,
    value: drafts[type] ?? String(availability[FIELD[type]] ?? DEFAULT[type]),
    onChange: (e) => setDrafts((d) => ({ ...d, [type]: e.target.value })),
    onBlur: () => commitPrice(type),
    onKeyDown: (e) => { if (e.key === 'Enter') e.currentTarget.blur(); },
  });

  const commitPrice = async (type) => {
    const raw = drafts[type];
    if (raw === undefined) return;
    let price = parseFloat(raw);
    if (isNaN(price) || price < MIN[type]) {
      price = MIN[type];
      setPriceNote(`Minimum is ${type === 'livestream' ? `${MIN[type]} 🌹` : `$${MIN[type]}`} — set to the minimum.`);
    } else {
      setPriceNote('');
    }
    setDrafts((d) => { const n = { ...d }; delete n[type]; return n; });
    if (price === availability[FIELD[type]]) return;
    await updatePrice(type, price);
  };

  const setLivestreamFree = async (free) => {
    if ((availability.livestreamFree !== false) === free) return;
    setAvailability((a) => ({ ...a, livestreamFree: free })); // instant UI
    try {
      const updated = await updateCreatorAvailability(currentUser.uid, { ...availability, livestreamFree: free });
      setAvailability(updated);
    } catch (error) {
      logger.error('Error updating livestream access:', error);
    }
  };

  const updatePrice = async (type, value) => {
    const price = parseFloat(value);
    const minVal = MIN[type];
    if (isNaN(price) || price < minVal) {
      return;
    }

    try {
      const fieldName = type === 'video' ? 'videoCallPrice' : (type === 'voice' ? 'voiceCallPrice' : 'livestreamPrice');
      const updated = await updateCreatorAvailability(currentUser.uid, {
        ...availability,
        [fieldName]: price
      });
      setAvailability(updated);
    } catch (error) {
      logger.error('Error updating price:', error);
    }
  };

  if (loading) {
    return (
      <div className={compact ? "py-4 flex items-center justify-center" : "bg-white rounded-2xl border border-gray-200 p-6"}>
        <div className="flex items-center justify-center h-20">
          <Loader2 className="w-6 h-6 text-rose-500 animate-spin" />
        </div>
      </div>
    );
  }

  const isAvailable = availability.status === 'available';

  if (compact) {
    return (
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleAvailability}
              disabled={saving}
              className={`relative inline-flex items-center h-11 w-20 rounded-full transition-all duration-300 shadow-inner ${
                isAvailable ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-gray-300 hover:bg-gray-400'
              } ${saving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <span
                className={`inline-flex items-center justify-center h-9 w-9 transform rounded-full bg-white shadow-md transition-transform duration-300 ${
                  isAvailable ? 'translate-x-10' : 'translate-x-1'
                }`}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                ) : isAvailable ? (
                  <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                ) : (
                  <span className="w-3 h-3 rounded-full bg-gray-400" />
                )}
              </span>
            </button>

            <div>
              <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                {isAvailable ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Live & Available for Calls</span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-gray-400" />
                    <span className="text-gray-600">Offline (Calls Paused)</span>
                  </>
                )}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Video: ${availability.videoCallPrice || 5}/30m • Voice: ${availability.voiceCallPrice || 3}/30m
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowRates(prev => !prev)}
            className="text-xs font-semibold text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg flex items-center gap-1 transition"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Rates</span>
            {showRates ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {/* Collapsible Pricing Section */}
        <AnimatePresence>
          {showRates && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 pt-4 border-t border-gray-100 space-y-3 overflow-hidden"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                      <Video className="w-3.5 h-3.5 text-rose-500" /> Video Call
                    </span>
                    <span className="text-[10px] text-gray-400">30 mins</span>
                  </div>
                  <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5">
                    <span className="text-xs text-gray-400 font-bold">$</span>
                    <input
              {...priceInputProps('video')}
              className="w-full text-sm font-bold text-gray-900 focus:outline-none"
            />
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                      <Mic className="w-3.5 h-3.5 text-blue-500" /> Voice Call
                    </span>
                    <span className="text-[10px] text-gray-400">30 mins</span>
                  </div>
                  <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5">
                    <span className="text-xs text-gray-400 font-bold">$</span>
                    <input
              {...priceInputProps('voice')}
              className="w-full text-sm font-bold text-gray-900 focus:outline-none"
            />
                  </div>
                </div>
              </div>
              {priceNote && <p className="text-[11px] text-amber-600 font-semibold mt-2">{priceNote}</p>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6"
    >
      <div className="flex items-start justify-between gap-3 mb-4 sm:mb-6">
        <div className="min-w-0">
          <h3 className="text-lg sm:text-xl font-bold text-gray-900">Call Availability</h3>
          <p className="text-sm text-gray-600 mt-1">
            Let fans book video/voice calls with you
          </p>
        </div>

        <button
          onClick={toggleAvailability}
          disabled={saving}
          aria-label={isAvailable ? 'Turn calls off' : 'Turn calls on'}
          className={`relative flex-shrink-0 inline-flex items-center h-9 w-16 sm:h-12 sm:w-24 rounded-full transition-colors ${
            isAvailable ? 'bg-green-500' : 'bg-gray-300'
          } ${saving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <span
            className={`inline-flex items-center justify-center h-7 w-7 sm:h-10 sm:w-10 transform rounded-full bg-white shadow-lg transition-transform ${
              isAvailable ? 'translate-x-8 sm:translate-x-12' : 'translate-x-1'
            }`}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 sm:w-6 sm:h-6 text-gray-400 animate-spin" />
            ) : isAvailable ? (
              <ToggleRight className="w-4 h-4 sm:w-6 sm:h-6 text-green-500" />
            ) : (
              <ToggleLeft className="w-4 h-4 sm:w-6 sm:h-6 text-gray-400" />
            )}
          </span>
        </button>
      </div>

      {/* Status Badge */}
      <div className="mb-4 sm:mb-6">
        <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${
          isAvailable 
            ? 'bg-green-100 text-green-700' 
            : 'bg-gray-100 text-gray-700'
        }`}>
          <span className={`w-2 h-2 rounded-full mr-2 ${
            isAvailable ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
          }`} />
          {isAvailable ? 'Available for Calls' : 'Offline'}
        </div>
      </div>

      {/* Pricing Controls */}
      <div className="space-y-4">
        {priceNote && <p className="text-xs text-amber-600 font-semibold">{priceNote}</p>}

        {/* Video Call Price */}
        <div className="bg-gray-50 rounded-xl p-3 sm:p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <Video className="w-5 h-5 text-rose-500" />
              <span className="font-semibold text-gray-900">Video Call</span>
            </div>
            <span className="text-xs text-gray-500">30 minutes</span>
          </div>
          
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              {...priceInputProps('video')}
              className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-lg focus:border-rose-500 focus:outline-none font-semibold text-base sm:text-lg"
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Minimum: ${MINIMUM_VIDEO_PRICE} • Set any price above it
          </p>
        </div>

        {/* Voice Call Price */}
        <div className="bg-gray-50 rounded-xl p-3 sm:p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <Mic className="w-5 h-5 text-blue-500" />
              <span className="font-semibold text-gray-900">Voice Call</span>
            </div>
            <span className="text-xs text-gray-500">30 minutes</span>
          </div>
          
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              {...priceInputProps('voice')}
              className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none font-semibold text-base sm:text-lg"
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Minimum: ${MINIMUM_VOICE_PRICE} • Set any price above it
          </p>
        </div>

        {/* Livestream Pass Price */}
        <div className="bg-gray-50 rounded-xl p-3 sm:p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <span className="text-lg">🌹</span>
              <span className="font-semibold text-gray-900">Livestream Access</span>
            </div>
            <span className="text-xs text-gray-500">Roses</span>
          </div>
          
          {/* Free or paid live */}
          <div className="grid grid-cols-2 gap-2 mb-3 p-1 bg-white border border-gray-200 rounded-xl">
            {[{ free: true, label: 'Free' }, { free: false, label: 'Paid ticket' }].map((o) => {
              const active = (availability.livestreamFree !== false) === o.free;
              return (
                <button key={o.label} type="button" onClick={() => setLivestreamFree(o.free)}
                  className={`min-h-[44px] rounded-lg text-sm font-bold transition ${active ? 'bg-rose-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}>
                  {o.label}
                </button>
              );
            })}
          </div>

          {availability.livestreamFree !== false ? (
            <p className="text-xs text-gray-500">
              Anyone can join your lives for free. Fans can still tip and request the stage.
            </p>
          ) : (
            <>
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 font-bold">🌹</span>
                <input
                  {...priceInputProps('livestream')}
                  className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-lg focus:border-rose-500 focus:outline-none font-semibold text-base sm:text-lg"
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Minimum: 1 Rose 🌹 • Fans buy this 1-hour ticket block to watch your live stream.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Info Note */}
      {isAvailable && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg"
        >
          <p className="text-sm text-green-800">
            🟢 You're now available! Fans with active subscriptions can book calls with you.
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}
