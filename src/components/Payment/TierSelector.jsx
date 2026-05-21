// src/components/Payment/TierSelector.jsx
import React, { useState, useEffect } from 'react';
import { Check, Crown, Star, Heart, Loader2 } from 'lucide-react';
import { getCreatorTiers, DEFAULT_TIERS } from '../../services/tierService';

export default function TierSelector({ creatorId, selectedTier, onSelect }) {
  const [tiers, setTiers] = useState(DEFAULT_TIERS);
  const [billingCycle, setBillingCycle] = useState('monthly'); // 'monthly' | 'yearly'
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const fetchTiers = async () => {
      try {
        if (!creatorId) return;
        const data = await getCreatorTiers(creatorId);
        if (active) {
          setTiers({
            supporter: { ...DEFAULT_TIERS.supporter, ...(data?.supporter || {}) },
            vip: { ...DEFAULT_TIERS.vip, ...(data?.vip || {}) },
            superfan: { ...DEFAULT_TIERS.superfan, ...(data?.superfan || {}) },
          });
        }
      } catch (err) {
        console.error('Error loading creator tiers:', err);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchTiers();
    return () => {
      active = false;
    };
  }, [creatorId]);

  const getTierPrice = (tier) => {
    const basePrice = Number(tier.price || 0);
    if (billingCycle === 'yearly') {
      // 20% discount on yearly sub, billed annually
      return parseFloat((basePrice * 0.8 * 12).toFixed(2));
    }
    return basePrice;
  };

  const getMonthlyEquivalent = (tier) => {
    const basePrice = Number(tier.price || 0);
    if (billingCycle === 'yearly') {
      return parseFloat((basePrice * 0.8).toFixed(2));
    }
    return basePrice;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-3">
        <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
        <p className="text-gray-500 text-sm">Loading subscription tiers...</p>
      </div>
    );
  }

  const tierKeys = ['supporter', 'vip', 'superfan'];

  const getTierIcon = (key) => {
    switch (key) {
      case 'supporter':
        return <Heart className="w-5 h-5 text-pink-500" />;
      case 'vip':
        return <Crown className="w-5 h-5 text-rose-500" />;
      case 'superfan':
        return <Star className="w-5 h-5 text-amber-500 fill-amber-500" />;
      default:
        return <Crown className="w-5 h-5 text-rose-500" />;
    }
  };

  return (
    <div className="w-full space-y-8">
      {/* Duration Billing Toggle */}
      <div className="flex justify-center">
        <div className="bg-gray-100 p-1.5 rounded-2xl flex items-center shadow-inner">
          <button
            onClick={() => setBillingCycle('monthly')}
            className={`px-6 py-2 rounded-xl font-bold text-sm transition-all duration-300 ${
              billingCycle === 'monthly'
                ? 'bg-white text-gray-900 shadow-md scale-100'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingCycle('yearly')}
            className={`px-6 py-2 rounded-xl font-bold text-sm transition-all duration-300 flex items-center space-x-2.5 ${
              billingCycle === 'yearly'
                ? 'bg-white text-gray-900 shadow-md scale-100'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <span>Yearly</span>
            <span className="bg-green-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold animate-pulse">
              Save 20%
            </span>
          </button>
        </div>
      </div>

      {/* Tiers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto px-4">
        {tierKeys.map((key) => {
          const tier = tiers[key];
          if (!tier) return null;

          const isSelected = selectedTier === key;
          const price = getTierPrice(tier);
          const monthlyEquiv = getMonthlyEquivalent(tier);

          // Highlight styling
          let cardStyle = 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-md';
          let badgeText = '';
          let badgeStyle = '';

          if (key === 'vip') {
            cardStyle = 'border-rose-400 ring-2 ring-rose-400 ring-opacity-20 bg-gradient-to-b from-rose-50/20 to-white hover:shadow-lg relative md:-translate-y-2';
            badgeText = 'Most Popular';
            badgeStyle = 'bg-rose-500 text-white';
          } else if (key === 'superfan') {
            cardStyle = 'border-amber-400 ring-2 ring-amber-400 ring-opacity-20 bg-gradient-to-b from-amber-50/20 to-white hover:shadow-lg relative';
            badgeText = 'Best Value';
            badgeStyle = 'bg-amber-500 text-white';
          }

          if (isSelected) {
            cardStyle += ' !border-rose-500 ring-4 ring-rose-500 ring-opacity-30';
          }

          return (
            <div
              key={key}
              className={`rounded-3xl border-2 p-6 flex flex-col justify-between transition-all duration-300 ${cardStyle}`}
            >
              <div>
                {/* Badge Tag */}
                {badgeText && (
                  <span className={`absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm ${badgeStyle}`}>
                    {badgeText}
                  </span>
                )}

                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2.5 bg-gray-50 rounded-2xl flex items-center justify-center">
                    {getTierIcon(key)}
                  </div>
                  <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
                    Tier {tier.level || 1}
                  </span>
                </div>

                {/* Title & Description */}
                <h3 className="text-xl font-extrabold text-gray-900 mb-2 capitalize">
                  {tier.name}
                </h3>

                {/* Pricing */}
                <div className="mb-6 flex flex-col">
                  <div className="flex items-baseline space-x-1">
                    <span className="text-3xl font-extrabold text-gray-900">
                      ${billingCycle === 'yearly' ? price.toFixed(2) : price.toFixed(2)}
                    </span>
                    <span className="text-gray-500 text-sm font-semibold">
                      /{billingCycle === 'yearly' ? 'yr' : 'mo'}
                    </span>
                  </div>
                  {billingCycle === 'yearly' && (
                    <span className="text-green-600 text-xs font-bold mt-1">
                      ${monthlyEquiv.toFixed(2)}/mo equivalent (billed annually)
                    </span>
                  )}
                </div>

                {/* Divider */}
                <div className="border-t border-gray-100 my-4" />

                {/* Perks Checklist */}
                <div className="space-y-3 mb-8">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Included Perks:
                  </p>
                  {Array.isArray(tier.benefits) && tier.benefits.map((benefit, i) => (
                    <div key={i} className="flex items-start space-x-2.5">
                      <div className="mt-0.5 p-0.5 bg-green-50 border border-green-200 rounded-full flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-green-600" />
                      </div>
                      <p className="text-sm text-gray-600 font-medium leading-tight">
                        {benefit}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={() => onSelect && onSelect(key, price, billingCycle)}
                className={`w-full py-3.5 rounded-2xl font-bold transition-all duration-300 shadow-md ${
                  isSelected
                    ? 'bg-rose-600 hover:bg-rose-700 text-white ring-2 ring-rose-500 ring-offset-2'
                    : key === 'vip'
                    ? 'bg-rose-500 hover:bg-rose-600 text-white'
                    : key === 'superfan'
                    ? 'bg-amber-500 hover:bg-amber-600 text-white'
                    : 'bg-gray-900 hover:bg-gray-800 text-white'
                }`}
              >
                {isSelected ? 'Selected' : `Select ${tier.name}`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
