// src/components/wallet/TopUpHistory.jsx
// Every top-up the user has made (bank transfer NGN + crypto), live status, and a one-tap
// "Share receipt" so they can send the details to support if something is pending too long.

import { useEffect, useMemo, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Share2, Check, Copy, Receipt, Landmark, Bitcoin } from 'lucide-react';
import { db } from '../../config/firebase';

const STATUS = {
  pending: { label: 'Pending review', cls: 'bg-amber-100 text-amber-800' },
  pending_payment: { label: 'Awaiting payment', cls: 'bg-amber-100 text-amber-800' },
  confirming: { label: 'Confirming', cls: 'bg-blue-100 text-blue-800' },
  confirmed: { label: 'Confirmed', cls: 'bg-emerald-100 text-emerald-800' },
  approved: { label: 'Approved', cls: 'bg-emerald-100 text-emerald-800' },
  completed: { label: 'Completed', cls: 'bg-emerald-100 text-emerald-800' },
  partially_paid: { label: 'Partially paid', cls: 'bg-orange-100 text-orange-800' },
  rejected: { label: 'Rejected', cls: 'bg-red-100 text-red-700' },
  failed: { label: 'Failed', cls: 'bg-red-100 text-red-700' },
  expired: { label: 'Expired', cls: 'bg-gray-100 text-gray-600' },
  refunded: { label: 'Refunded', cls: 'bg-gray-100 text-gray-600' },
};

const toDate = (ts) => ts?.toDate?.() || (ts?.seconds ? new Date(ts.seconds * 1000) : ts ? new Date(ts) : null);

export default function TopUpHistory({ userId }) {
  const [ngn, setNgn] = useState([]);
  const [crypto, setCrypto] = useState([]);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    if (!userId) return;
    const u1 = onSnapshot(query(collection(db, 'ngn_payments'), where('userId', '==', userId)),
      (s) => setNgn(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {});
    const u2 = onSnapshot(query(collection(db, 'crypto_payments'), where('userId', '==', userId)),
      (s) => setCrypto(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => !p.contentType || p.contentType === 'topup')), () => {});
    return () => { u1(); u2(); };
  }, [userId]);

  const items = useMemo(() => [
    ...ngn.map((p) => ({
      id: p.id, method: 'Bank transfer (NGN)', icon: Landmark,
      reference: p.reference || p.id,
      usd: Number(p.amountUSD || 0),
      local: p.amountNGN ? `₦${Number(p.amountNGN).toLocaleString()}` : null,
      rate: p.rate ? `₦${Number(p.rate).toLocaleString()}/$` : null,
      status: p.status || 'pending',
      date: toDate(p.createdAt),
      note: p.rejectionReason || null,
    })),
    ...crypto.map((p) => ({
      id: p.id, method: 'Crypto', icon: Bitcoin,
      reference: p.reference || p.id,
      usd: Number(p.baseAmount || p.amount || 0),
      local: p.payAmount && p.payCurrency ? `${p.payAmount} ${String(p.payCurrency).toUpperCase()}` : null,
      rate: null,
      status: p.status || 'pending_payment',
      date: toDate(p.createdAt),
      txHash: p.txHash || null,
    })),
  ].sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0)), [ngn, crypto]);

  const receiptText = (it) => [
    'Unlukt top-up receipt',
    `Reference: ${it.reference}`,
    `Amount: $${it.usd.toFixed(2)}${it.local ? ` (${it.local})` : ''}`,
    it.rate ? `Rate: ${it.rate}` : null,
    `Method: ${it.method}`,
    `Status: ${(STATUS[it.status] || { label: it.status }).label}`,
    it.date ? `Date: ${it.date.toLocaleString()}` : null,
    it.txHash ? `Tx hash: ${it.txHash}` : null,
  ].filter(Boolean).join('\n');

  const share = async (it) => {
    const text = receiptText(it);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Unlukt top-up receipt', text });
        return;
      }
    } catch { /* cancelled → fall back to copy */ }
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(it.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch { /* clipboard blocked */ }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <Receipt className="w-5 h-5 text-rose-500" />
        <p className="text-sm font-bold text-gray-900">Top-up history</p>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-gray-500 py-4 text-center">No top-ups yet.</p>
      ) : (
        <div className="space-y-2">
          {items.map((it) => {
            const st = STATUS[it.status] || { label: it.status, cls: 'bg-gray-100 text-gray-600' };
            const Icon = it.icon;
            return (
              <div key={it.id} className="border border-gray-100 rounded-xl p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="w-9 h-9 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0"><Icon className="w-4 h-4 text-gray-600" /></span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900">
                        ${it.usd.toFixed(2)}{it.local && <span className="font-medium text-gray-500"> · {it.local}</span>}
                      </p>
                      <p className="text-xs text-gray-500">{it.method}{it.date ? ` · ${it.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}</p>
                      <p className="text-[11px] text-gray-400 font-mono truncate">Ref: {it.reference}</p>
                      {it.note && <p className="text-xs text-red-600 mt-1">{it.note}</p>}
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${st.cls}`}>{st.label}</span>
                </div>
                <button onClick={() => share(it)}
                  className="mt-2 w-full min-h-[40px] rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-1.5">
                  {copiedId === it.id
                    ? <><Check className="w-4 h-4 text-emerald-600" /> Copied — paste it to support</>
                    : navigator.share ? <><Share2 className="w-4 h-4" /> Share receipt</> : <><Copy className="w-4 h-4" /> Copy receipt</>}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
