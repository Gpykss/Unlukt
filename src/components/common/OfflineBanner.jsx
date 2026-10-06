// src/components/common/OfflineBanner.jsx
// App-wide "you're offline" strip, so people on flaky data/WiFi know why things aren't loading
// (and that payments won't go through until they're back online).
import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export default function OfflineBanner() {
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && navigator.onLine === false);
  const [back, setBack] = useState(false);
  useEffect(() => {
    let t;
    const off = () => { setOffline(true); setBack(false); };
    const on = () => { setOffline(false); setBack(true); clearTimeout(t); t = setTimeout(() => setBack(false), 2500); };
    window.addEventListener('offline', off);
    window.addEventListener('online', on);
    return () => { window.removeEventListener('offline', off); window.removeEventListener('online', on); clearTimeout(t); };
  }, []);
  if (!offline && !back) return null;
  return (
    <div role="status" className={`fixed top-0 inset-x-0 z-[140] text-center text-xs font-semibold py-1.5 px-3 ${offline ? 'bg-gray-900 text-white' : 'bg-emerald-500 text-white'}`}
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 6px)' }}>
      {offline
        ? <span className="inline-flex items-center gap-1.5"><WifiOff className="w-3.5 h-3.5" /> You're offline — showing saved content. Payments and messages will wait until you reconnect.</span>
        : 'Back online ✓'}
    </div>
  );
}
