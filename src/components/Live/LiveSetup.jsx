// src/components/Live/LiveSetup.jsx
// Pre-live studio: the creator sets up the session BEFORE going live.
// Saved to users/{uid}.liveSettings so next time it's prefilled.

import { useState } from 'react';
import { Radio, Plus, Trash2, Users, HelpCircle, Sparkles, Ticket, ArrowLeft, Loader2, CalendarClock } from 'lucide-react';
import ScheduledLiveCard from './ScheduledLiveCard';

export const DEFAULT_LIVE_SETTINGS = {
  title: '',
  entryFree: true,
  entryPrice: 10,
  guestEnabled: true,
  guestPrice: 0,
  maxGuests: 1,
  questionsEnabled: true,
  questionPrice: 0,
  requestsEnabled: true,
  requestMenu: [
    { label: 'Shoutout', price: 5 },
    { label: 'Song request', price: 10 },
  ],
  allowCustomRequest: true,
  customRequestMin: 5,
};

/** Merge saved settings over defaults and sanitize numbers. */
export const normalizeLiveSettings = (s = {}) => {
  const m = { ...DEFAULT_LIVE_SETTINGS, ...(s || {}) };
  const n = (v, min, fallback) => {
    const x = Math.floor(Number(v));
    return Number.isFinite(x) && x >= min ? x : fallback;
  };
  return {
    ...m,
    title: String(m.title || '').slice(0, 80),
    entryPrice: n(m.entryPrice, 1, 10),
    guestPrice: n(m.guestPrice, 0, 0),
    maxGuests: Math.min(4, n(m.maxGuests, 1, 1)),
    questionPrice: n(m.questionPrice, 0, 0),
    customRequestMin: n(m.customRequestMin, 1, 5),
    requestMenu: (Array.isArray(m.requestMenu) ? m.requestMenu : [])
      .map((i) => ({ label: String(i?.label || '').trim().slice(0, 40), price: n(i?.price, 1, 1) }))
      .filter((i) => i.label)
      .slice(0, 8),
  };
};

const Row = ({ icon: Icon, title, sub, children }) => (
  <div className="bg-slate-900 border border-white/5 rounded-2xl p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3 min-w-0">
        <span className="w-9 h-9 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <p className="font-bold text-sm text-white">{title}</p>
          {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
        </div>
      </div>
    </div>
    {children && <div className="mt-3">{children}</div>}
  </div>
);

const Toggle = ({ on, onChange, label }) => (
  <button type="button" onClick={() => onChange(!on)} aria-pressed={on} aria-label={label}
    className={`relative w-12 h-7 rounded-full transition flex-shrink-0 ${on ? 'bg-rose-500' : 'bg-slate-700'}`}>
    <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${on ? 'left-6' : 'left-1'}`} />
  </button>
);

const RoseInput = ({ value, onChange, min = 0, placeholder }) => (
  <div className="relative">
    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs">🌹</span>
    <input type="number" inputMode="numeric" min={min} step="1" value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-slate-950 border border-white/10 rounded-xl pl-8 pr-3 py-2.5 text-base sm:text-sm text-white placeholder-slate-600 focus:outline-none focus:border-rose-500" />
  </div>
);

export default function LiveSetup({ uid, initial, creatorName, onGoLive, onBack, onDone, busy, scheduled, onSchedule, shareNote }) {
  const [s, setS] = useState(() => normalizeLiveSettings(initial));
  const set = (patch) => setS((p) => ({ ...p, ...patch }));
  const [newItem, setNewItem] = useState({ label: '', price: '' });
  const [when, setWhen] = useState('');
  const minWhen = (() => {
    const d = new Date(Date.now() + 5 * 60000);
    d.setSeconds(0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  })();

  // Scheduled and not due yet → the creator can leave; Go Live becomes secondary
  const waitingForSchedule = !!scheduled && scheduled.date.getTime() - Date.now() > 10 * 60000;
  const [savingSched, setSavingSched] = useState(false);
  const doSchedule = async () => {
    setSavingSched(true);
    try { await onSchedule(new Date(when), normalizeLiveSettings(s)); } finally { setSavingSched(false); }
  };

  const addItem = () => {
    if (!newItem.label.trim() || !(Number(newItem.price) >= 1)) return;
    set({ requestMenu: [...s.requestMenu, { label: newItem.label.trim(), price: Math.floor(Number(newItem.price)) }].slice(0, 8) });
    setNewItem({ label: '', price: '' });
  };

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-white">
      <div className="sticky top-0 z-10 bg-slate-950/90 backdrop-blur border-b border-white/5">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} aria-label="Back" className="p-2 -ml-2 rounded-xl hover:bg-white/5"><ArrowLeft className="w-5 h-5" /></button>
          <div>
            <h1 className="font-black text-lg leading-tight">Live Studio</h1>
            <p className="text-xs text-slate-400">Set up your live before you go on air</p>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-5 space-y-3 pb-32">
        {scheduled && <ScheduledLiveCard uid={uid} variant="dark" showWhenEmpty={false} onGoLive={() => onGoLive(normalizeLiveSettings(s))} />}
        <Row icon={Radio} title="Title" sub="Shown to fans at the top of your live">
          <input value={s.title} maxLength={80} onChange={(e) => set({ title: e.target.value })}
            placeholder={`${creatorName || 'My'} live 🔴`}
            className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-base sm:text-sm text-white placeholder-slate-600 focus:outline-none focus:border-rose-500" />
        </Row>

        {/* Schedule for later + share link */}
        <Row icon={CalendarClock} title="Schedule for later" sub="Pick a time, share the link — fans see the countdown and join when you go live">
          {scheduled ? (
            <div className="space-y-2">
              <p className="text-sm text-white">Your next live is pinned at the top ↑ — share or cancel it there.</p>
              {waitingForSchedule && (
                <p className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2 leading-relaxed">
                  ✓ You're all set — you don't need to stay here. We'll remind you 5 minutes before. Fans who open your link see a countdown and join automatically when you go live.
                </p>
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              <input type="datetime-local" value={when} min={minWhen} onChange={(e) => setWhen(e.target.value)}
                className="flex-1 min-w-0 bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-base sm:text-sm text-white [color-scheme:dark] focus:outline-none focus:border-rose-500" />
              <button type="button" disabled={!when || busy || savingSched}
                onClick={doSchedule}
                className="px-4 rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-40 text-sm font-bold whitespace-nowrap">
                {savingSched ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Schedule'}
              </button>
            </div>
          )}
          {shareNote && <p className="text-xs text-emerald-400 mt-2">{shareNote}</p>}
        </Row>

        <Row icon={Ticket} title="Entry" sub={s.entryFree ? 'Free — anyone can watch' : 'Fans buy a 1-hour ticket to watch'}>
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 border border-white/10 rounded-xl mb-3">
            {[{ v: true, l: 'Free' }, { v: false, l: 'Paid ticket' }].map((o) => (
              <button key={o.l} type="button" onClick={() => set({ entryFree: o.v })}
                className={`min-h-[40px] rounded-lg text-sm font-bold ${s.entryFree === o.v ? 'bg-rose-500 text-white' : 'text-slate-400'}`}>{o.l}</button>
            ))}
          </div>
          {!s.entryFree && <RoseInput value={s.entryPrice} min={1} onChange={(v) => set({ entryPrice: v })} />}
        </Row>

        <Row icon={Users} title="Guests on stage" sub="Fans can ask to join you on camera">
          <div className="flex items-center justify-between gap-3 mb-3">
            <span className="text-sm text-slate-300">Allow guest requests</span>
            <Toggle on={s.guestEnabled} onChange={(v) => set({ guestEnabled: v })} label="Allow guest requests" />
          </div>
          {s.guestEnabled && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] font-bold text-slate-400 mb-1.5">Price to request (0 = free)</p>
                <RoseInput value={s.guestPrice} onChange={(v) => set({ guestPrice: v })} />
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400 mb-1.5">Max guests at once</p>
                <div className="grid grid-cols-4 gap-1">
                  {[1, 2, 3, 4].map((n) => (
                    <button key={n} type="button" onClick={() => set({ maxGuests: n })}
                      className={`h-[42px] rounded-lg text-sm font-bold border ${s.maxGuests === n ? 'bg-rose-500 border-rose-500 text-white' : 'border-white/10 text-slate-300'}`}>{n}</button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Row>

        <Row icon={HelpCircle} title="Questions" sub="Fans ask you something — it's highlighted for you">
          <div className="flex items-center justify-between gap-3 mb-3">
            <span className="text-sm text-slate-300">Allow questions</span>
            <Toggle on={s.questionsEnabled} onChange={(v) => set({ questionsEnabled: v })} label="Allow questions" />
          </div>
          {s.questionsEnabled && (
            <>
              <p className="text-[11px] font-bold text-slate-400 mb-1.5">Price per question (0 = free)</p>
              <RoseInput value={s.questionPrice} onChange={(v) => set({ questionPrice: v })} />
            </>
          )}
        </Row>

        <Row icon={Sparkles} title="Custom requests" sub="Your menu of things fans can pay for during the live">
          <div className="flex items-center justify-between gap-3 mb-3">
            <span className="text-sm text-slate-300">Accept requests</span>
            <Toggle on={s.requestsEnabled} onChange={(v) => set({ requestsEnabled: v })} label="Accept requests" />
          </div>
          {s.requestsEnabled && (
            <div className="space-y-2">
              {s.requestMenu.map((item, i) => (
                <div key={i} className="flex items-center gap-2 bg-slate-950 border border-white/10 rounded-xl px-3 py-2">
                  <span className="flex-1 text-sm truncate">{item.label}</span>
                  <span className="text-sm font-bold text-rose-400">🌹 {item.price}</span>
                  <button type="button" aria-label={`Remove ${item.label}`} onClick={() => set({ requestMenu: s.requestMenu.filter((_, j) => j !== i) })}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-white/5"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
              {s.requestMenu.length < 8 && (
                <div className="flex gap-2">
                  <input value={newItem.label} maxLength={40} onChange={(e) => setNewItem((p) => ({ ...p, label: e.target.value }))}
                    placeholder="e.g. Say my name"
                    className="flex-1 min-w-0 bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-base sm:text-sm text-white placeholder-slate-600 focus:outline-none focus:border-rose-500" />
                  <div className="w-24"><RoseInput value={newItem.price} min={1} placeholder="Price" onChange={(v) => setNewItem((p) => ({ ...p, price: v }))} /></div>
                  <button type="button" onClick={addItem} aria-label="Add item"
                    className="w-11 rounded-xl bg-white/10 hover:bg-white/15 flex items-center justify-center"><Plus className="w-5 h-5" /></button>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 pt-2">
                <span className="text-sm text-slate-300">Let fans write their own request</span>
                <Toggle on={s.allowCustomRequest} onChange={(v) => set({ allowCustomRequest: v })} label="Allow own requests" />
              </div>
              {s.allowCustomRequest && (
                <div>
                  <p className="text-[11px] font-bold text-slate-400 mb-1.5">Minimum for a custom request</p>
                  <RoseInput value={s.customRequestMin} min={1} onChange={(v) => set({ customRequestMin: v })} />
                </div>
              )}
            </div>
          )}
        </Row>
      </div>

      <div className="fixed bottom-0 inset-x-0 bg-slate-950/95 backdrop-blur border-t border-white/5 p-4">
        <div className="max-w-xl mx-auto" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          {waitingForSchedule ? (
            <div className="flex gap-2">
              <button onClick={() => onGoLive(normalizeLiveSettings(s))} disabled={busy}
                className="flex-1 min-h-[52px] rounded-2xl bg-white/10 hover:bg-white/15 disabled:opacity-60 font-bold text-sm flex items-center justify-center gap-2">
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Go live now'}
              </button>
              <button onClick={onDone} disabled={busy}
                className="flex-[1.4] min-h-[52px] rounded-2xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 font-black text-base shadow-lg shadow-rose-500/20">
                Done — see you at {scheduled.date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </button>
            </div>
          ) : (
            <button onClick={() => onGoLive(normalizeLiveSettings(s))} disabled={busy}
              className="w-full min-h-[52px] rounded-2xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 disabled:opacity-60 font-black text-base flex items-center justify-center gap-2 shadow-lg shadow-rose-500/20">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <><span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" /> Go Live</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
