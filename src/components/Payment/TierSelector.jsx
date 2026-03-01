// src/components/Payment/TierSelector.jsx - Tier & Duration Selector

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Check, Crown, Star, Sparkles, Loader2 } from 'lucide-react';
import { getCreatorTiers } from '../../services/tierService';
import logger from '../../utils/logger';

const TIER_ICONS = {
  supporter: Star,
  vip: Crown,
  superfan: Sparkles
};

const TIER_COLORS = {
  supporter: 'blue',
  vip: 'purple',
  superfan: 'rose'
};

export default function TierSelector({ creatorId, onSelect }) {
  const [loading, setLoading] = useState(true);
  const [tiers, setTiers] = useState(null);
  const [selectedTier, setSelectedTier] = useState('supporter');
  const [selectedDuration, setSelectedDuration] = useState('monthly');

  useEffect(() => {
    loadTiers();
  }, [creatorId]);

  const loadTiers = async () => {
    try {
      setLoading(true);
      const data = await getCreatorTiers(creatorId);
      setTiers(data);
      
      if (!data.enabled) {
        logger.warn('Creator has not enabled tiers');
      }
    } catch (error) {
      logger.error('Error loading tiers:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculatePrice = (tier) => {
    if (!tier) return 0;
    
    const basePrice = tier.price;
    
    switch (selectedDuration) {
      case 'daily':
        return (basePrice * 0.05).toFixed(2);
      case 'weekly':
        return (basePrice * 0.25).toFixed(2);
      case 'monthly':
      default:
        return basePrice.toFixed(2);
    }
  };

  const handleSelect = () => {
    if (onSelect) {
      onSelect({
        tier: selectedTier,
        duration: selectedDuration,
        price: parseFloat(calculatePrice(tiers[selectedTier]))
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
      </div>
    );
  }

  if (!tiers || !tiers.enabled) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Creator hasn't set up tier pricing yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Duration Selector */}
      <div>
        <h3 className="text-lg font-bold text-gray-900 mb-3">Choose Duration</h3>
        <div className="grid grid-cols-3 gap-3">
          {['daily', 'weekly', 'monthly'].map((duration) => (
            <button
              key={duration}
              onClick={() => setSelectedDuration(duration)}
              className={`px-4 py-3 rounded-xl font-semibold transition ${
                selectedDuration === duration
                  ? 'bg-rose-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {duration.charAt(0).toUpperCase() + duration.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Tier Cards */}
      <div>
        <h3 className="text-lg font-bold text-gray-900 mb-3">Select Tier</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.entries(tiers).map(([key, tier]) => {
            if (!tier || !tier.name) return null;
            
            const Icon = TIER_ICONS[key];
            const color = TIER_COLORS[key];
            const isSelected = selectedTier === key;
            const price = calculatePrice(tier);

            return (
              <motion.button
                key={key}
                onClick={() => setSelectedTier(key)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`relative p-6 rounded-2xl border-2 transition text-left ${
                  isSelected
                    ? `border-${color}-500 bg-${color}-50`
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                {/* Selected Badge */}
                {isSelected && (
                  <div className={`absolute top-4 right-4 w-6 h-6 rounded-full bg-${color}-500 flex items-center justify-center`}>
                    <Check className="w-4 h-4 text-white" />
                  </div>
                )}

                {/* Icon */}
                <div className={`w-12 h-12 rounded-full bg-${color}-100 flex items-center justify-center mb-4`}>
                  <Icon className={`w-6 h-6 text-${color}-500`} />
                </div>

                {/* Tier Name */}
                <h4 className="text-xl font-bold text-gray-900 mb-2">{tier.name}</h4>

                {/* Price */}
                <div className="mb-4">
                  <span className="text-3xl font-bold text-gray-900">${price}</span>
                  <span className="text-gray-600">/{selectedDuration}</span>
                </div>

                {/* Benefits */}
                <ul className="space-y-2">
                  {tier.benefits?.map((benefit, idx) => (
                    <li key={idx} className="flex items-start text-sm text-gray-700">
                      <Check className={`w-4 h-4 text-${color}-500 mr-2 mt-0.5 flex-shrink-0`} />
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Subscribe Button */}
      <motion.button
        onClick={handleSelect}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="w-full py-4 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl transition"
      >
        Subscribe - ${calculatePrice(tiers[selectedTier])}
      </motion.button>

      {/* Pricing Note */}
      <p className="text-xs text-center text-gray-500">
        {selectedDuration === 'daily' && '95% off monthly price'}
        {selectedDuration === 'weekly' && '75% off monthly price'}
        {selectedDuration === 'monthly' && 'Best value - full access'}
      </p>
    </div>
  );
}
