// src/components/Settings/CreatorDiscountManager.jsx

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Tag, Percent, Calendar, Package, Plus,
  Trash2, ToggleLeft, ToggleRight, Loader2,
  CheckCircle, AlertCircle, Info
} from 'lucide-react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';

const DISCOUNT_TYPES = [
  {
    id: 'first_month',
    label: 'First Month Off',
    icon: Tag,
    description: 'New subscribers get X% off their first month',
    color: 'rose',
  },
  {
    id: 'limited_time',
    label: 'Limited Time Offer',
    icon: Calendar,
    description: 'X% off for everyone until a specific date',
    color: 'purple',
  },
  {
    id: 'bundle',
    label: 'Bundle Deal',
    icon: Package,
    description: 'e.g. 3 months for the price of 2 (33% off monthly)',
    color: 'blue',
  },
];

const COLOR_MAP = {
  rose:   { bg: 'bg-rose-50',   border: 'border-rose-200',   icon: 'text-rose-500',   badge: 'bg-rose-100 text-rose-700'   },
  purple: { bg: 'bg-purple-50', border: 'border-purple-200', icon: 'text-purple-500', badge: 'bg-purple-100 text-purple-700' },
  blue:   { bg: 'bg-blue-50',   border: 'border-blue-200',   icon: 'text-blue-500',   badge: 'bg-blue-100 text-blue-700'   },
};

const defaultDiscount = (type) => ({
  type,
  active: false,
  percent: type === 'bundle' ? 33 : 20,
  label: '',
  expiresAt: '',
  bundleMonths: 3,
  bundlePriceMonths: 2,
  firstMonthOnly: type === 'first_month',
  createdAt: null,
});

export default function CreatorDiscountManager() {
  const { currentUser } = useAuth();
  const [discounts, setDiscounts] = useState({
    first_month: defaultDiscount('first_month'),
    limited_time: defaultDiscount('limited_time'),
    bundle: defaultDiscount('bundle'),
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null); // which type is saving
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (currentUser) loadDiscounts();
  }, [currentUser]);

  const loadDiscounts = async () => {
    try {
      setLoading(true);
      const snap = await getDoc(doc(db, 'creator_discounts', currentUser.uid));
      if (snap.exists()) {
        const data = snap.data();
        setDiscounts(prev => ({
          first_month:  { ...prev.first_month,  ...(data.first_month  || {}) },
          limited_time: { ...prev.limited_time, ...(data.limited_time || {}) },
          bundle:       { ...prev.bundle,       ...(data.bundle       || {}) },
        }));
      }
    } catch (e) {
      console.error('Error loading discounts:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (type) => {
    setDiscounts(prev => ({
      ...prev,
      [type]: { ...prev[type], active: !prev[type].active },
    }));
  };

  const handleChange = (type, field, value) => {
    setDiscounts(prev => ({
      ...prev,
      [type]: { ...prev[type], [field]: value },
    }));
  };

  const handleSave = async (type) => {
    setError('');
    const d = discounts[type];

    // Validate
    if (d.percent < 1 || d.percent > 90) {
      setError('Discount must be between 1% and 90%');
      return;
    }
    if (type === 'limited_time' && d.active && !d.expiresAt) {
      setError('Please set an expiry date for the limited time offer');
      return;
    }

    try {
      setSaving(type);
      const ref = doc(db, 'creator_discounts', currentUser.uid);
      const snap = await getDoc(ref);
      const existing = snap.exists() ? snap.data() : {};

      await setDoc(ref, {
        ...existing,
        [type]: {
          ...d,
          createdAt: d.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
      });

      setSaved(type);
      setTimeout(() => setSaved(null), 2500);
    } catch (e) {
      setError('Failed to save discount: ' + e.message);
    } finally {
      setSaving(null);
    }
  };

  const handleDeactivate = async (type) => {
    try {
      setSaving(type);
      const ref = doc(db, 'creator_discounts', currentUser.uid);
      const snap = await getDoc(ref);
      const existing = snap.exists() ? snap.data() : {};

      await setDoc(ref, {
        ...existing,
        [type]: { ...discounts[type], active: false, updatedAt: serverTimestamp() },
        updatedAt: serverTimestamp(),
      });

      setDiscounts(prev => ({ ...prev, [type]: { ...prev[type], active: false } }));
      setSaved(type);
      setTimeout(() => setSaved(null), 2000);
    } catch (e) {
      setError('Failed to deactivate');
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-rose-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Subscription Discounts</h2>
          <p className="text-xs text-gray-500 mt-0.5">Shown to fans when they click Subscribe</p>
        </div>
        <span className="text-xs bg-rose-50 text-rose-600 border border-rose-200 px-2 py-1 rounded-full font-semibold">
          Creator only
        </span>
      </div>

      {error && (
        <div className="mx-6 mt-4 flex items-center space-x-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="p-6 space-y-5">
        {DISCOUNT_TYPES.map(({ id, label, icon: Icon, description, color }) => {
          const d = discounts[id];
          const c = COLOR_MAP[color];
          const isSaving = saving === id;
          const isSaved = saved === id;

          return (
            <div
              key={id}
              className={`rounded-2xl border-2 overflow-hidden transition ${
                d.active ? `${c.border} ${c.bg}` : 'border-gray-200 bg-white'
              }`}
            >
              {/* Header row */}
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-xl ${d.active ? c.bg : 'bg-gray-100'}`}>
                    <Icon className={`w-5 h-5 ${d.active ? c.icon : 'text-gray-400'}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-gray-900 text-sm">{label}</p>
                      {d.active && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.badge}`}>
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">{description}</p>
                  </div>
                </div>

                <button
                  onClick={() => handleToggle(id)}
                  className="flex-shrink-0"
                  title={d.active ? 'Disable' : 'Enable'}
                >
                  {d.active
                    ? <ToggleRight className={`w-8 h-8 ${c.icon}`} />
                    : <ToggleLeft className="w-8 h-8 text-gray-300" />}
                </button>
              </div>

              {/* Expanded controls */}
              <AnimatePresence>
                {d.active && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 pb-5 space-y-4 border-t border-gray-100">
                      <div className="h-3" />

                      {/* Percent off */}
                      {id !== 'bundle' && (
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                            Discount percent
                          </label>
                          <div className="flex items-center space-x-3">
                            <div className="relative flex-1">
                              <input
                                type="number"
                                value={d.percent}
                                onChange={e => handleChange(id, 'percent', Number(e.target.value))}
                                min={1}
                                max={90}
                                className="w-full pl-4 pr-10 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-rose-400 text-sm font-bold"
                              />
                              <Percent className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            </div>
                            <span className="text-sm text-gray-500 whitespace-nowrap">
                              off {id === 'first_month' ? 'first month' : 'subscription'}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Bundle specific */}
                      {id === 'bundle' && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                              Months purchased
                            </label>
                            <input
                              type="number"
                              value={d.bundleMonths}
                              onChange={e => {
                                const months = Number(e.target.value);
                                const pct = Math.round((1 - d.bundlePriceMonths / months) * 100);
                                handleChange(id, 'bundleMonths', months);
                                handleChange(id, 'percent', Math.max(1, Math.min(90, pct)));
                              }}
                              min={2}
                              max={12}
                              className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-rose-400 text-sm font-bold"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                              Price of X months
                            </label>
                            <input
                              type="number"
                              value={d.bundlePriceMonths}
                              onChange={e => {
                                const price = Number(e.target.value);
                                const pct = Math.round((1 - price / d.bundleMonths) * 100);
                                handleChange(id, 'bundlePriceMonths', price);
                                handleChange(id, 'percent', Math.max(1, Math.min(90, pct)));
                              }}
                              min={1}
                              max={d.bundleMonths - 1}
                              className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-rose-400 text-sm font-bold"
                            />
                          </div>
                          <div className="col-span-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 flex items-center space-x-2">
                            <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />
                            <p className="text-xs text-blue-700 font-semibold">
                              Fan pays for {d.bundlePriceMonths} months, gets {d.bundleMonths} — {d.percent}% off
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Label / name */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                          Display label <span className="font-normal text-gray-400">(optional)</span>
                        </label>
                        <input
                          type="text"
                          value={d.label}
                          onChange={e => handleChange(id, 'label', e.target.value)}
                          placeholder={
                            id === 'first_month' ? 'e.g. Welcome offer' :
                            id === 'limited_time' ? 'e.g. Black Friday deal' :
                            'e.g. 3-month bundle'
                          }
                          maxLength={40}
                          className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-rose-400 text-sm"
                        />
                      </div>

                      {/* Expiry date (limited time only) */}
                      {id === 'limited_time' && (
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                            Offer expires on <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="date"
                            value={d.expiresAt}
                            onChange={e => handleChange(id, 'expiresAt', e.target.value)}
                            min={new Date().toISOString().split('T')[0]}
                            className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-rose-400 text-sm"
                          />
                        </div>
                      )}

                      {/* Preview */}
                      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                        <p className="text-xs font-semibold text-gray-500 mb-1">Fan will see:</p>
                        <p className="text-sm font-bold text-green-700">
                          🎉 {d.percent}% off
                          {id === 'first_month' ? ' your first month' : ''}
                          {id === 'bundle' ? ` — ${d.bundleMonths} months for ${d.bundlePriceMonths}` : ''}
                          {d.label ? ` · ${d.label}` : ''}
                          {id === 'limited_time' && d.expiresAt
                            ? ` · Ends ${new Date(d.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                            : ''}
                        </p>
                      </div>

                      {/* Save / Deactivate */}
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleSave(id)}
                          disabled={isSaving}
                          className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition flex items-center justify-center gap-2 ${
                            isSaved
                              ? 'bg-green-500 text-white'
                              : 'bg-rose-500 hover:bg-rose-600 text-white disabled:bg-gray-200 disabled:text-gray-400'
                          }`}
                        >
                          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> :
                           isSaved  ? <><CheckCircle className="w-4 h-4" /> Saved!</> :
                           'Save Discount'}
                        </button>
                        <button
                          onClick={() => handleDeactivate(id)}
                          disabled={isSaving}
                          className="px-4 py-2.5 rounded-xl font-bold text-sm border-2 border-gray-200 hover:border-red-300 hover:text-red-600 transition flex items-center gap-1.5 text-gray-600"
                        >
                          <Trash2 className="w-4 h-4" />
                          Off
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        {/* Info note */}
        <div className="flex items-start space-x-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
          <Info className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-500">
            Active discounts appear in the Subscribe modal when fans visit your profile. Only one discount applies per subscription — the most recently activated takes priority.
          </p>
        </div>
      </div>
    </div>
  );
}