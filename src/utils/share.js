// src/utils/share.js
// Share a link via the phone's share sheet, or copy it on desktop. Returns 'shared' | 'copied' | 'failed'.
export const shareLink = async ({ url, title = 'Unlukt', text = '' }) => {
  try {
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return 'shared';
    }
  } catch (e) {
    if (e?.name === 'AbortError') return 'failed'; // user closed the sheet
  }
  try {
    await navigator.clipboard.writeText(text ? `${text}\n${url}` : url);
    return 'copied';
  } catch {
    return 'failed';
  }
};

export const liveUrl = (creatorId) => `${window.location.origin}/livestream/${creatorId}`;

/** "Fri, Oct 10 · 8:00 PM" */
export const formatLiveTime = (date) => date.toLocaleString([], {
  weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});

/** "in 2h 15m" / "in 3 days" / "now" */
export const timeUntil = (date) => {
  const ms = date.getTime() - Date.now();
  if (ms <= 0) return 'now';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `in ${hrs}h ${mins % 60}m`;
  const days = Math.round(hrs / 24);
  return `in ${days} day${days > 1 ? 's' : ''}`;
};

/** Upcoming scheduled live on a user doc, or null (past schedules are ignored). */
export const getScheduledLive = (user) => {
  const at = user?.scheduledLive?.at;
  const d = at?.toDate?.() || (at?.seconds ? new Date(at.seconds * 1000) : at ? new Date(at) : null);
  if (!d || isNaN(d.getTime()) || d.getTime() < Date.now() - 30 * 60 * 1000) return null;
  return { date: d, title: user.scheduledLive.title || '' };
};
