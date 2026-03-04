// src/components/Dashboard/AvailabilityToggle.jsx - Call Availability Manager

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Video, Mic, DollarSign, ToggleLeft, ToggleRight, Loader2 } from 'lucide-react';
import { getCreatorAvailability, updateCreatorAvailability } from '../../services/videoCallService';
import { useAuth } from '../../hooks/useAuth';
import logger from '../../utils/logger';

export default function AvailabilityToggle() {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [availability, setAvailability] = useState({
    status: 'offline',
    videoCallPrice: 12,
    voiceCallPrice: 12,
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

  const updatePrice = async (type, value) => {
    const price = parseFloat(value);
    if (isNaN(price) || price < (type === 'video' ? 10 : 5)) {
      return;
    }

    try {
      const updated = await updateCreatorAvailability(currentUser.uid, {
        ...availability,
        [type === 'video' ? 'videoCallPrice' : 'voiceCallPrice']: price
      });
      setAvailability(updated);
    } catch (error) {
      logger.error('Error updating price:', error);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
        </div>
      </div>
    );
  }

  const isAvailable = availability.status === 'available';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-gray-200 p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold text-gray-900">Call Availability</h3>
          <p className="text-sm text-gray-600 mt-1">
            Let fans book video/voice calls with you
          </p>
        </div>

        <button
          onClick={toggleAvailability}
          disabled={saving}
          className={`relative inline-flex items-center h-12 w-24 rounded-full transition-colors ${
            isAvailable ? 'bg-green-500' : 'bg-gray-300'
          } ${saving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <span
            className={`inline-block h-10 w-10 transform rounded-full bg-white shadow-lg transition-transform ${
              isAvailable ? 'translate-x-12' : 'translate-x-1'
            }`}
          >
            {saving ? (
              <Loader2 className="w-6 h-6 m-2 text-gray-400 animate-spin" />
            ) : isAvailable ? (
              <ToggleRight className="w-6 h-6 m-2 text-green-500" />
            ) : (
              <ToggleLeft className="w-6 h-6 m-2 text-gray-400" />
            )}
          </span>
        </button>
      </div>

      {/* Status Badge */}
      <div className="mb-6">
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
        {/* Video Call Price */}
        <div className="bg-gray-50 rounded-xl p-4">
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
              type="number"
              min="12"
              step="1"
              value={availability.videoCallPrice}
              onChange={(e) => updatePrice('video', e.target.value)}
              onBlur={(e) => {
                if (parseFloat(e.target.value) < 12) {
                  e.target.value = 12;
                  updatePrice('video', 12);
                }
              }}
              className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-lg focus:border-rose-500 focus:outline-none font-semibold text-lg"
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Minimum: $12 • VIP gets 10% off • Superfan gets 20% off
          </p>
        </div>

        {/* Voice Call Price */}
        <div className="bg-gray-50 rounded-xl p-4">
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
              type="number"
              min="12"
              step="1"
              value={availability.voiceCallPrice}
              onChange={(e) => updatePrice('voice', e.target.value)}
              onBlur={(e) => {
                if (parseFloat(e.target.value) < 12) {
                  e.target.value = 12;
                  updatePrice('voice', 12);
                }
              }}
              className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none font-semibold text-lg"
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Minimum: $12 • VIP gets 10% off • Superfan gets 20% off
          </p>
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
