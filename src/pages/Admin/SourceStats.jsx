// src/pages/Admin/SourceStats.jsx
// Where sign-ups come from. Put ?src=NAME on any link you share (unlukt.com/skyla?src=reddit);
// the name is saved on the new user at sign-up, and this table counts, per name:
// sign-ups → funded wallets → paying fans. Numbers come from the server (`sourceStats`).

import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { Loader2, Link2, RefreshCw } from 'lucide-react';
import { functions } from '../../config/firebase';

const pct = (part, whole) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—');

export default function SourceStats({ sinceDays = null, rangeLabel = 'All time' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await httpsCallable(functions, 'sourceStats', { timeout: 60000 })({ sinceDays });
      setData(res.data);
    } catch (e) {
      console.error('sourceStats failed', e);
      setError('Could not load traffic sources. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [sinceDays]);

  const rows = data?.rows || [];
  const totals = data?.totals || { signups: 0, funded: 0, paying: 0 };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h2 className="font-bold text-gray-900 flex items-center gap-2">
          <Link2 className="w-5 h-5 text-rose-500" />
          Traffic Sources
        </h2>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          aria-label="Refresh traffic sources"
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </button>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        People who signed up in: <b>{rangeLabel}</b>. Add <code className="bg-gray-100 px-1 rounded">?src=name</code> to
        any link you share, for example <code className="bg-gray-100 px-1 rounded">unlukt.com/skyla?src=reddit</code>.
      </p>

      {error ? (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">{error}</p>
      ) : loading && !data ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-6">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500 py-4">No sign-ups in this period yet.</p>
      ) : (
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                <th className="py-2 pr-4 font-semibold">Source</th>
                <th className="py-2 px-3 font-semibold text-right">Sign-ups</th>
                <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">Funded wallets</th>
                <th className="py-2 pl-3 font-semibold text-right whitespace-nowrap">Paying fans</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.source} className="border-b border-gray-100 last:border-0">
                  <td className={`py-2.5 pr-4 font-medium ${r.source.startsWith('(') ? 'text-gray-400' : 'text-gray-900'}`}>
                    {r.source}
                  </td>
                  <td className="py-2.5 px-3 text-right font-semibold text-gray-900 tabular-nums">{r.signups}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums">
                    <span className="font-semibold text-gray-900">{r.funded}</span>
                    <span className="text-xs text-gray-400 ml-1.5">{pct(r.funded, r.signups)}</span>
                  </td>
                  <td className="py-2.5 pl-3 text-right tabular-nums">
                    <span className="font-semibold text-gray-900">{r.paying}</span>
                    <span className="text-xs text-gray-400 ml-1.5">{pct(r.paying, r.signups)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 text-gray-900 font-bold">
                <td className="py-2.5 pr-4">Total</td>
                <td className="py-2.5 px-3 text-right tabular-nums">{totals.signups}</td>
                <td className="py-2.5 px-3 text-right tabular-nums">{totals.funded}</td>
                <td className="py-2.5 pl-3 text-right tabular-nums">{totals.paying}</td>
              </tr>
            </tfoot>
          </table>
          <p className="text-[11px] text-gray-400 mt-3">
            Funded wallet = added money at least once. Paying fan = bought something (subscription, unlock, tip, call).
            Percentages are out of that source&apos;s sign-ups.
          </p>
        </div>
      )}
    </div>
  );
}
