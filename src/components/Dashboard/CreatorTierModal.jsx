// src/components/Dashboard/CreatorTierModal.jsx
// Implements PRD Section 15.6: Creator 3-Tier Membership Management
// Allows creators to configure prices, perks, and call discounts for Supporter, VIP, and Superfan tiers.

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Crown, Star, Heart, Check, Plus, Trash2,
  AlertCircle, Loader2, Save, Sparkles, ShieldCheck
} from 'lucide-react';
import { getCreatorTiers, saveCreatorTiers, DEFAULT_TIERS } from '../../services/tierService';

export default function CreatorTierModal({ isOpen, onClose, creatorId }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [enabled, setEnabled] = useState(true);
  const [supporter, setSupporter] = useState(DEFAULT_TIERS.supporter);
  const [vip, setVip] = useState(DEFAULT_TIERS.vip);
  const [superfan, setSuperfan] = useState(DEFAULT_TIERS.superfan);

  const [newPerks, setNewPerks] = useState({ supporter: '', vip: '', superfan: '' });

  useEffect(() => {
    if (!isOpen || !creatorId) return;

    let active = true;
    setLoading(true);
    setError('');
    setSuccess(false);

    const loadTiers = async () => {
      try {
        const data = await getCreatorTiers(creatorId);
        if (!active) return;

        setEnabled(data.enabled !== false);
        setSupporter({
          ...DEFAULT_TIERS.supporter,
          ...(data.supporter || {}),
        });
        setVip({
          ...DEFAULT_TIERS.vip,
          ...(data.vip || {}),
        });
        setSuperfan({
          ...DEFAULT_TIERS.superfan,
          ...(data.superfan || {}),
        });
      } catch (err) {
        console.error('Error fetching creator tiers:', err);
        setError('Failed to load your tier settings.');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadTiers();
    return () => { active = false; };
  }, [isOpen, creatorId]);

  const handleAddPerk = (tierKey) => {
    const perkText = (newPerks[tierKey] || '').trim();
    if (!perkText) return;

    const setterMap = { supporter: setSupporter, vip: setVip, superfan: setSuperfan };
    const currentTier = tierKey === 'supporter' ? supporter : tierKey === 'vip' ? vip : superfan;

    setterMap[tierKey]({
      ...currentTier,
      benefits: [...(currentTier.benefits || []), perkText],
    });

    setNewPerks(prev => ({ ...prev, [tierKey]: '' }));
  };

  const handleRemovePerk = (tierKey, index) => {
    const setterMap = { supporter: setSupporter, vip: setVip, superfan: setSuperfan };
    const currentTier = tierKey === 'supporter' ? supporter : tierKey === 'vip' ? vip : superfan;

    setterMap[tierKey]({
      ...currentTier,
      benefits: (currentTier.benefits || []).filter((_, i) => i !== index),
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    const suppPrice = Number(supporter.price);
    const vipPrice = Number(vip.price);
    const supPrice = Number(superfan.price);

    if (isNaN(suppPrice) || suppPrice < 0.5) {
      setError('Supporter tier price must be at least $0.50.');
      return;
    }
    if (isNaN(vipPrice) || vipPrice <= suppPrice) {
      setError('VIP tier price must be higher than Supporter tier price.');
      return;
    }
    if (isNaN(supPrice) || supPrice <= vipPrice) {
      setError('Superfan tier price must be higher than VIP tier price.');
      return;
    }

    setSaving(true);
    try {
      await saveCreatorTiers(creatorId, {
        enabled,
        supporter: { ...supporter, price: suppPrice },
        vip: { ...vip, price: vipPrice },
        superfan: { ...superfan, price: supPrice },
      });
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1200);
    } catch (err) {
      console.error('Error saving tiers:', err);
      setError(err.message || 'Failed to save tier settings.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-white rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl border border-gray-100 flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-rose-50/50 to-pink-50/50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-500">
              <Crown className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">Subscription Tiers</h2>
              <p className="text-xs text-gray-500">Configure prices, perks, and call discounts for your fans</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-white rounded-full transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2.5 text-xs text-red-600 font-medium">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2.5 text-xs text-emerald-700 font-bold animate-in fade-in">
              <ShieldCheck className="w-4 h-4 flex-shrink-0 text-emerald-600" />
              <span>Tier settings saved successfully!</span>
            </div>
          )}

          {loading ? (
            <div className="py-16 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-rose-500 animate-spin mx-auto" />
              <p className="text-xs text-gray-500 font-medium">Loading tier settings...</p>
            </div>
          ) : (
            <form id="tier-form" onSubmit={handleSave} className="space-y-6">
              {/* Global Enable Switch */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-200/70">
                <div>
                  <h4 className="text-sm font-bold text-gray-900">Enable Subscriptions</h4>
                  <p className="text-xs text-gray-500 mt-0.5">Allow fans to subscribe to your profile</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rose-500"></div>
                </label>
              </div>

              {/* 3 Tiers Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 🥉 Tier 1: Supporter */}
                <div className="bg-white rounded-2xl border-2 border-pink-200/70 p-4 flex flex-col justify-between shadow-2xs hover:shadow-sm transition">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Heart className="w-4 h-4 text-pink-500" />
                        <span className="text-xs font-bold uppercase tracking-wider text-pink-700">Supporter</span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-pink-50 text-pink-600 rounded-full border border-pink-200">
                        Level 1
                      </span>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Price ($/month)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0.50"
                          value={supporter.price}
                          onChange={(e) => setSupporter({ ...supporter, price: e.target.value })}
                          className="w-full pl-7 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:border-pink-500"
                          required
                        />
                      </div>
                    </div>

                    {/* Perks List */}
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1.5">Included Perks</label>
                      <div className="space-y-1.5 max-h-36 overflow-y-auto">
                        {(supporter.benefits || []).map((benefit, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs bg-gray-50 px-2.5 py-1.5 rounded-lg border border-gray-100">
                            <span className="truncate text-gray-700 pr-1">{benefit}</span>
                            <button
                              type="button"
                              onClick={() => handleRemovePerk('supporter', idx)}
                              className="text-gray-400 hover:text-red-500 transition p-0.5"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center gap-1.5 mt-2">
                        <input
                          type="text"
                          placeholder="Add perk..."
                          value={newPerks.supporter}
                          onChange={(e) => setNewPerks({ ...newPerks, supporter: e.target.value })}
                          onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddPerk('supporter'))}
                          className="flex-1 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-pink-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddPerk('supporter')}
                          className="p-1.5 bg-pink-100 text-pink-700 hover:bg-pink-200 rounded-lg transition"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 🥈 Tier 2: VIP */}
                <div className="bg-white rounded-2xl border-2 border-rose-300 p-4 flex flex-col justify-between shadow-xs hover:shadow-md transition relative">
                  <div className="absolute -top-2.5 right-3 bg-gradient-to-r from-rose-500 to-pink-500 text-white font-bold text-[9px] uppercase px-2 py-0.5 rounded-full shadow-2xs">
                    Popular
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Crown className="w-4 h-4 text-rose-500" />
                        <span className="text-xs font-bold uppercase tracking-wider text-rose-700">VIP</span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-rose-50 text-rose-600 rounded-full border border-rose-200">
                        Level 2
                      </span>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Price ($/month)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={vip.price}
                          onChange={(e) => setVip({ ...vip, price: e.target.value })}
                          className="w-full pl-7 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:border-rose-500"
                          required
                        />
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">Includes 10% discount on video calls</p>
                    </div>

                    {/* Perks List */}
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1.5">Included Perks</label>
                      <div className="space-y-1.5 max-h-36 overflow-y-auto">
                        {(vip.benefits || []).map((benefit, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs bg-gray-50 px-2.5 py-1.5 rounded-lg border border-gray-100">
                            <span className="truncate text-gray-700 pr-1">{benefit}</span>
                            <button
                              type="button"
                              onClick={() => handleRemovePerk('vip', idx)}
                              className="text-gray-400 hover:text-red-500 transition p-0.5"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center gap-1.5 mt-2">
                        <input
                          type="text"
                          placeholder="Add perk..."
                          value={newPerks.vip}
                          onChange={(e) => setNewPerks({ ...newPerks, vip: e.target.value })}
                          onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddPerk('vip'))}
                          className="flex-1 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-rose-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddPerk('vip')}
                          className="p-1.5 bg-rose-100 text-rose-700 hover:bg-rose-200 rounded-lg transition"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 🥇 Tier 3: Superfan */}
                <div className="bg-white rounded-2xl border-2 border-amber-300/80 p-4 flex flex-col justify-between shadow-2xs hover:shadow-sm transition">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                        <span className="text-xs font-bold uppercase tracking-wider text-amber-700">Superfan</span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-50 text-amber-600 rounded-full border border-amber-200">
                        Level 3
                      </span>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Price ($/month)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={superfan.price}
                          onChange={(e) => setSuperfan({ ...superfan, price: e.target.value })}
                          className="w-full pl-7 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:border-amber-500"
                          required
                        />
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">Includes 20% discount on video calls</p>
                    </div>

                    {/* Perks List */}
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1.5">Included Perks</label>
                      <div className="space-y-1.5 max-h-36 overflow-y-auto">
                        {(superfan.benefits || []).map((benefit, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs bg-gray-50 px-2.5 py-1.5 rounded-lg border border-gray-100">
                            <span className="truncate text-gray-700 pr-1">{benefit}</span>
                            <button
                              type="button"
                              onClick={() => handleRemovePerk('superfan', idx)}
                              className="text-gray-400 hover:text-red-500 transition p-0.5"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center gap-1.5 mt-2">
                        <input
                          type="text"
                          placeholder="Add perk..."
                          value={newPerks.superfan}
                          onChange={(e) => setNewPerks({ ...newPerks, superfan: e.target.value })}
                          onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddPerk('superfan'))}
                          className="flex-1 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-amber-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddPerk('superfan')}
                          className="p-1.5 bg-amber-100 text-amber-700 hover:bg-amber-200 rounded-lg transition"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-xs font-bold text-gray-600 hover:bg-gray-200 rounded-xl transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="tier-form"
            disabled={saving || loading}
            className="px-6 py-2.5 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white font-bold text-xs rounded-xl shadow-md hover:shadow-lg transition disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving tiers...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Tier Settings</span>
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
