// src/pages/Settings/CreatorDiscountManager.jsx
// Creator sets actual discounted prices directly (not percentages)

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Tag, Calendar, Package, Trash2,
  ToggleLeft, ToggleRight, Loader2,
  CheckCircle, AlertCircle, Info
} from 'lucide-react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';

const DISCOUNT_TYPES = [
  { id: 'first_month',  label: 'First Month Deal',     icon: Tag,      description: "Special price for new subscribers' first month", color: 'rose'   },
  { id: 'limited_time', label: 'Limited Time Offer',   icon: Calendar, description: 'Special prices for everyone until a set date',   color: 'purple' },
  { id: 'bundle',       label: 'Bundle Deal',           icon: Package,  description: 'Fan gets X months for a set total price',        color: 'blue'   },
];

const COLOR_MAP = {
  rose:   { bg: 'bg-rose-50',   border: 'border-rose-200',   icon: 'text-rose-500',   badge: 'bg-rose-100 text-rose-700'   },
  purple: { bg: 'bg-purple-50', border: 'border-purple-200', icon: 'text-purple-500', badge: 'bg-purple-100 text-purple-700' },
  blue:   { bg: 'bg-blue-50',   border: 'border-blue-200',   icon: 'text-blue-500',   badge: 'bg-blue-100 text-blue-700'   },
};

const defaultDiscount = (type) => ({
  type, active: false, label: '',
  priceMonthly: '', priceWeekly: '', priceDaily: '',
  bundleMonths: 3, bundlePrice: '',
  expiresAt: '', createdAt: null,
});

export default function CreatorDiscountManager({ baseMonthly = 0, baseWeekly = null, baseDaily = null }) {
  const { currentUser } = useAuth();
  const [discounts, setDiscounts] = useState({
    first_month:  defaultDiscount('first_month'),
    limited_time: defaultDiscount('limited_time'),
    bundle:       defaultDiscount('bundle'),
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(null);
  const [saved,  setSaved]    = useState(null);
  const [error,  setError]    = useState('');

  useEffect(() => { if (currentUser) loadDiscounts(); }, [currentUser]);

  const loadDiscounts = async () => {
    try {
      setLoading(true);
      const snap = await getDoc(doc(db, 'creator_discounts', currentUser.uid));
      if (snap.exists()) {
        const data = snap.data();
        const parse = (type) => ({
          ...defaultDiscount(type),
          ...(data[type] || {}),
          priceMonthly: data[type]?.priceMonthly ?? '',
          priceWeekly:  data[type]?.priceWeekly  ?? '',
          priceDaily:   data[type]?.priceDaily    ?? '',
          bundlePrice:  data[type]?.bundlePrice   ?? '',
        });
        setDiscounts({ first_month: parse('first_month'), limited_time: parse('limited_time'), bundle: parse('bundle') });
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const toggle  = (type)         => setDiscounts(p => ({ ...p, [type]: { ...p[type], active: !p[type].active } }));
  const change  = (type, k, v)   => setDiscounts(p => ({ ...p, [type]: { ...p[type], [k]: v } }));

  const savings = (discounted, base) => {
    const d = parseFloat(discounted), b = parseFloat(base);
    if (!d || !b || b <= 0 || d >= b) return null;
    return { amount: (b - d).toFixed(2), pct: Math.round((b - d) / b * 100) };
  };

  const validate = (type) => {
    const d = discounts[type];
    if (type === 'bundle') {
      if (!d.bundlePrice || parseFloat(d.bundlePrice) <= 0) return 'Enter a valid bundle total price';
      return null;
    }
    if (!d.priceMonthly || parseFloat(d.priceMonthly) <= 0) return 'Enter a discounted monthly price';
    if (baseMonthly > 0 && parseFloat(d.priceMonthly) >= baseMonthly)
      return `Discounted monthly price must be less than $${baseMonthly.toFixed(2)}`;
    if (type === 'limited_time' && d.active && !d.expiresAt) return 'Set an expiry date';
    return null;
  };

  const handleSave = async (type) => {
    setError('');
    const err = validate(type);
    if (err) { setError(err); return; }
    try {
      setSaving(type);
      const d = discounts[type];
      const ref  = doc(db, 'creator_discounts', currentUser.uid);
      const snap = await getDoc(ref);
      const existing = snap.exists() ? snap.data() : {};

      // Compute percent for legacy display
      let percent = 0;
      if (type !== 'bundle' && baseMonthly > 0 && d.priceMonthly)
        percent = Math.round((baseMonthly - parseFloat(d.priceMonthly)) / baseMonthly * 100);
      else if (type === 'bundle' && d.bundleMonths && d.bundlePrice)
        percent = Math.round((baseMonthly * d.bundleMonths - parseFloat(d.bundlePrice)) / (baseMonthly * d.bundleMonths) * 100);

      await setDoc(ref, {
        ...existing,
        [type]: {
          ...d,
          percent: Math.max(0, percent),
          priceMonthly: d.priceMonthly !== '' ? parseFloat(d.priceMonthly) : null,
          priceWeekly:  d.priceWeekly  !== '' ? parseFloat(d.priceWeekly)  : null,
          priceDaily:   d.priceDaily   !== '' ? parseFloat(d.priceDaily)   : null,
          bundlePrice:  d.bundlePrice  !== '' ? parseFloat(d.bundlePrice)  : null,
          createdAt: d.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
      });
      setSaved(type);
      setTimeout(() => setSaved(null), 2500);
    } catch (e) { setError('Failed to save: ' + e.message); }
    finally { setSaving(null); }
  };

  const handleDeactivate = async (type) => {
    try {
      setSaving(type);
      const ref  = doc(db, 'creator_discounts', currentUser.uid);
      const snap = await getDoc(ref);
      const existing = snap.exists() ? snap.data() : {};
      await setDoc(ref, { ...existing, [type]: { ...discounts[type], active: false, updatedAt: serverTimestamp() }, updatedAt: serverTimestamp() });
      setDiscounts(p => ({ ...p, [type]: { ...p[type], active: false } }));
    } catch { setError('Failed to deactivate'); }
    finally { setSaving(null); }
  };

  if (loading) return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 flex items-center justify-center">
      <Loader2 className="w-6 h-6 text-rose-500 animate-spin" />
    </div>
  );

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Subscription Discounts</h2>
          <p className="text-xs text-gray-500 mt-0.5">Set special prices — shown to fans in the Subscribe modal</p>
        </div>
        <span className="text-xs bg-rose-50 text-rose-600 border border-rose-200 px-2 py-1 rounded-full font-semibold">Creator only</span>
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
          const isSaved  = saved  === id;

          return (
            <div key={id} className={`rounded-2xl border-2 overflow-hidden transition ${d.active ? `${c.border} ${c.bg}` : 'border-gray-200 bg-white'}`}>
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-xl ${d.active ? c.bg : 'bg-gray-100'}`}>
                    <Icon className={`w-5 h-5 ${d.active ? c.icon : 'text-gray-400'}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-gray-900 text-sm">{label}</p>
                      {d.active && <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.badge}`}>Active</span>}
                    </div>
                    <p className="text-xs text-gray-500">{description}</p>
                  </div>
                </div>
                <button onClick={() => toggle(id)} title={d.active ? 'Disable' : 'Enable'}>
                  {d.active ? <ToggleRight className={`w-8 h-8 ${c.icon}`} /> : <ToggleLeft className="w-8 h-8 text-gray-300" />}
                </button>
              </div>

              <AnimatePresence>
                {d.active && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                    <div className="px-5 pb-5 pt-4 space-y-4 border-t border-gray-100">

                      {/* ── BUNDLE ── */}
                      {id === 'bundle' && (
                        <>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Number of months</label>
                              <input type="number" value={d.bundleMonths} onChange={e => change(id, 'bundleMonths', Number(e.target.value))} min={2} max={12}
                                className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 text-sm font-bold" />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Bundle total price ($)</label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                                <input type="number" value={d.bundlePrice} onChange={e => change(id, 'bundlePrice', e.target.value)} min={0.99} step={0.01} placeholder="e.g. 19.99"
                                  className="w-full pl-8 pr-4 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 text-sm font-bold" />
                              </div>
                            </div>
                          </div>
                          {d.bundlePrice && d.bundleMonths && baseMonthly > 0 && (() => {
                            const regular = baseMonthly * d.bundleMonths;
                            const total   = parseFloat(d.bundlePrice);
                            const saved   = regular - total;
                            return (
                              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                                <p className="text-xs font-semibold text-blue-700 mb-1">Fan sees:</p>
                                <p className="text-sm font-bold text-blue-900">{d.bundleMonths} months for ${total.toFixed(2)}</p>
                                {saved > 0 && <p className="text-xs text-blue-600 mt-0.5">Regular: ${regular.toFixed(2)} → Save ${saved.toFixed(2)}</p>}
                              </div>
                            );
                          })()}
                        </>
                      )}

                      {/* ── FIRST MONTH / LIMITED TIME — direct price inputs ── */}
                      {id !== 'bundle' && (
                        <>
                          {/* Monthly price — required */}
                          <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                              📅 Discounted monthly price <span className="text-red-500">*</span>
                              {baseMonthly > 0 && <span className="font-normal text-gray-400 ml-1">(regular: ${baseMonthly.toFixed(2)})</span>}
                            </label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                              <input type="number" value={d.priceMonthly} onChange={e => change(id, 'priceMonthly', e.target.value)} min={0.49} step={0.01} placeholder="e.g. 6.99"
                                className="w-full pl-8 pr-4 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-rose-400 text-sm font-bold" />
                            </div>
                            {(() => { const s = savings(d.priceMonthly, baseMonthly); return s && <p className="text-xs text-green-600 font-semibold mt-1">✅ Fan saves ${s.amount} ({s.pct}% off)</p>; })()}
                          </div>

                          {/* Weekly price — only if creator set a weekly base price */}
                          {baseWeekly != null && baseWeekly > 0 && (
                            <div>
                              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                                🗓️ Discounted weekly price <span className="text-gray-400 font-normal">(optional — regular: ${baseWeekly.toFixed(2)})</span>
                              </label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                                <input type="number" value={d.priceWeekly} onChange={e => change(id, 'priceWeekly', e.target.value)} min={0.10} step={0.01} placeholder="e.g. 2.49"
                                  className="w-full pl-8 pr-4 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-rose-400 text-sm font-bold" />
                              </div>
                              {(() => { const s = savings(d.priceWeekly, baseWeekly); return s && <p className="text-xs text-green-600 font-semibold mt-1">✅ Fan saves ${s.amount} ({s.pct}% off)</p>; })()}
                            </div>
                          )}

                          {/* Daily price — only if creator set a daily base price */}
                          {baseDaily != null && baseDaily > 0 && (
                            <div>
                              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                                ⚡ Discounted daily price <span className="text-gray-400 font-normal">(optional — regular: ${baseDaily.toFixed(2)})</span>
                              </label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                                <input type="number" value={d.priceDaily} onChange={e => change(id, 'priceDaily', e.target.value)} min={0.05} step={0.01} placeholder="e.g. 0.99"
                                  className="w-full pl-8 pr-4 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-rose-400 text-sm font-bold" />
                              </div>
                              {(() => { const s = savings(d.priceDaily, baseDaily); return s && <p className="text-xs text-green-600 font-semibold mt-1">✅ Fan saves ${s.amount} ({s.pct}% off)</p>; })()}
                            </div>
                          )}
                        </>
                      )}

                      {/* Label */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                          Display label <span className="font-normal text-gray-400">(optional)</span>
                        </label>
                        <input type="text" value={d.label} onChange={e => change(id, 'label', e.target.value)}
                          placeholder={id === 'first_month' ? 'e.g. Welcome offer' : id === 'limited_time' ? 'e.g. Easter Sale' : 'e.g. 3-month bundle'}
                          maxLength={40} className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-rose-400 text-sm" />
                      </div>

                      {/* Expiry — limited_time only */}
                      {id === 'limited_time' && (
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Offer expires on <span className="text-red-500">*</span></label>
                          <input type="date" value={d.expiresAt} onChange={e => change(id, 'expiresAt', e.target.value)} min={new Date().toISOString().split('T')[0]}
                            className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-rose-400 text-sm" />
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-3">
                        <button onClick={() => handleSave(id)} disabled={isSaving}
                          className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition flex items-center justify-center gap-2 ${isSaved ? 'bg-green-500 text-white' : 'bg-rose-500 hover:bg-rose-600 text-white disabled:bg-gray-200 disabled:text-gray-400'}`}>
                          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : isSaved ? <><CheckCircle className="w-4 h-4" /> Saved!</> : 'Save Discount'}
                        </button>
                        <button onClick={() => handleDeactivate(id)} disabled={isSaving}
                          className="px-4 py-2.5 rounded-xl font-bold text-sm border-2 border-gray-200 hover:border-red-300 hover:text-red-600 transition flex items-center gap-1.5 text-gray-600">
                          <Trash2 className="w-4 h-4" /> Off
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        <div className="flex items-start space-x-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
          <Info className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-500">Active discounts appear in the Subscribe modal. Priority: Limited Time → First Month → Bundle.</p>
        </div>
      </div>
    </div>
  );
}