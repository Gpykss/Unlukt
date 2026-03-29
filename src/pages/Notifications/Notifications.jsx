// src/pages/Notifications/Notifications.jsx

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, Heart, MessageCircle, UserPlus, DollarSign,
  Star, AlertCircle, CheckCheck, Trash2, Loader2,
  Video, RefreshCw, Sparkles, Crown, ArrowLeft
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  subscribeToNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  deleteNotification as deleteNotificationService
} from '../../services/notificationService';

// ── Notification type config ──────────────────────────────────────────────────
const TYPE_CONFIG = {
  like:         { icon: Heart,          bg: 'bg-rose-100',    iconClass: 'text-rose-500 fill-rose-500',  label: 'Likes',       emoji: '❤️' },
  comment:      { icon: MessageCircle,  bg: 'bg-sky-100',     iconClass: 'text-sky-500',                label: 'Comments',    emoji: '💬' },
  follow:       { icon: UserPlus,       bg: 'bg-emerald-100', iconClass: 'text-emerald-500',            label: 'Follows',     emoji: '➕' },
  subscriber:   { icon: Crown,          bg: 'bg-purple-100',  iconClass: 'text-purple-500',             label: 'Subscribers', emoji: '👑' },
  tip:          { icon: DollarSign,     bg: 'bg-amber-100',   iconClass: 'text-amber-500',              label: 'Tips',        emoji: '💰' },
  refund:       { icon: RefreshCw,      bg: 'bg-blue-100',    iconClass: 'text-blue-500',               label: 'Refunds',     emoji: '↩️' },
  call_booking: { icon: Video,          bg: 'bg-rose-100',    iconClass: 'text-rose-500',               label: 'Calls',       emoji: '📹' },
  system:       { icon: AlertCircle,    bg: 'bg-gray-100',    iconClass: 'text-gray-500',               label: 'System',      emoji: '🔔' },
  default:      { icon: Sparkles,       bg: 'bg-rose-100',    iconClass: 'text-rose-500',               label: 'Other',       emoji: '✨' },
};

const getConfig = (type) => TYPE_CONFIG[type] || TYPE_CONFIG.default;

const FILTERS = [
  { id: 'all',          label: 'All',         emoji: '🔔' },
  { id: 'unread',       label: 'Unread',      emoji: '🔴' },
  { id: 'like',         label: 'Likes',       emoji: '❤️' },
  { id: 'comment',      label: 'Comments',    emoji: '💬' },
  { id: 'follow',       label: 'Follows',     emoji: '➕' },
  { id: 'subscriber',   label: 'Subscribers', emoji: '👑' },
  { id: 'tip',          label: 'Tips',        emoji: '💰' },
  { id: 'call_booking', label: 'Calls',       emoji: '📹' },
];

function formatTime(timestamp) {
  if (!timestamp) return 'Just now';
  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const m = Math.floor(diff / 60000);
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(diff / 86400000);
    if (m < 1)  return 'Just now';
    if (m < 60) return `${m}m ago`;
    if (h < 24) return `${h}h ago`;
    if (d < 7)  return `${d}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return 'Recently';
  }
}

// ── Single notification row ───────────────────────────────────────────────────
function NotificationRow({ notification, index, onDelete, onClick }) {
  const cfg = getConfig(notification.type);
  const Icon = cfg.icon;
  const isCall = notification.type === 'call_booking';
  const navigate = useNavigate();

  return (
    <div
      onClick={onClick}
      className={`
        group relative flex items-start gap-3 sm:gap-4 px-4 sm:px-5 py-4 cursor-pointer
        transition-all duration-200
        hover:bg-gray-50/80
        ${!notification.read ? 'bg-rose-50/40' : 'bg-white'}
        ${isCall && !notification.read ? '!bg-rose-50/70' : ''}
      `}
    >
      {/* Unread bar */}
      {!notification.read && (
        <span className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full bg-gradient-to-b from-rose-400 to-pink-500" />
      )}

      {/* Avatar / icon */}
      <div className="relative flex-shrink-0">
        {notification.actorAvatar && notification.actorAvatar.startsWith('http') ? (
          <img
            src={notification.actorAvatar}
            alt=""
            className="w-11 h-11 rounded-full object-cover ring-2 ring-white shadow"
          />
        ) : (
          <div className={`w-11 h-11 rounded-full ${cfg.bg} flex items-center justify-center shadow-sm`}>
            {notification.actorAvatar ? (
              <span className="text-xl">{notification.actorAvatar}</span>
            ) : (
              <Icon className={`w-5 h-5 ${cfg.iconClass}`} />
            )}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-800 leading-snug">
          {notification.actorName && (
            <span className="font-bold text-gray-900">{notification.actorName} </span>
          )}
          <span className={notification.actorName ? 'text-gray-600' : 'font-medium text-gray-900'}>
            {notification.message}
          </span>
        </p>
        <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
          <span>{formatTime(notification.createdAt)}</span>
          {!notification.read && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-rose-100 text-rose-600 rounded-full font-semibold text-[10px]">
              NEW
            </span>
          )}
        </p>

        {/* Call join button */}
        {isCall && notification.bookingId && (
          <motion.button
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            whileHover={{ scale: 1.03 }}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/waiting-room/${notification.bookingId}`);
            }}
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white rounded-lg text-xs font-bold shadow-sm transition"
          >
            <Video className="w-3.5 h-3.5" />
            Join Waiting Room
          </motion.button>
        )}
      </div>

      {/* Post thumbnail */}
      {notification.postImage && (
        <div className="flex-shrink-0 w-11 h-11 rounded-xl overflow-hidden bg-gray-100 shadow-sm">
          {notification.postImage.startsWith('http') ? (
            <img src={notification.postImage} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="flex items-center justify-center w-full h-full text-2xl">
              {notification.postImage}
            </span>
          )}
        </div>
      )}

      {/* Right controls */}
      <div className="flex flex-col items-end gap-2 flex-shrink-0 self-center">
        {!notification.read && (
          <motion.div
            animate={{ scale: [1, 1.3, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-sm"
          />
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(notification.id); }}
          className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-50 rounded-lg transition-all duration-200"
        >
          <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500 transition-colors" />
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Notifications() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [filter, setFilter] = useState('all');
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingAll, setDeletingAll] = useState(false);

  useEffect(() => {
    if (!currentUser) { navigate('/login'); return; }
    const unsub = subscribeToNotifications(currentUser.uid, (list) => {
      setNotifications(list);
      setLoading(false);
    });
    return () => unsub();
  }, [currentUser]);

  const handleMarkAllAsRead = async () => {
    try { await markAllNotificationsAsRead(currentUser.uid); } catch {}
  };

  const handleDelete = async (id) => {
    try { await deleteNotificationService(id); } catch {}
  };

  const handleClick = async (n) => {
    if (!n.read) {
      try { await markNotificationAsRead(n.id); } catch {}
    }
    switch (n.type) {
      case 'call_booking': if (n.bookingId) navigate(`/waiting-room/${n.bookingId}`); break;
      case 'follow':       if (n.actorUsername) navigate(`/creator/${n.actorUsername}`); break;
      case 'refund':       navigate('/wallet'); break;
      default: break;
    }
  };

  const filtered = notifications.filter(n => {
    if (filter === 'all')    return true;
    if (filter === 'unread') return !n.read;
    return n.type === filter;
  });

  const unread = notifications.filter(n => !n.read).length;

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center"
      >
        <div className="w-16 h-16 bg-gradient-to-br from-rose-400 to-pink-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
          <Bell className="w-8 h-8 text-white animate-bounce" />
        </div>
        <p className="text-gray-500 font-medium">Loading notifications…</p>
      </motion.div>
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 pb-24 lg:pb-10">

      {/* ── Hero header ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20">
        {/* Gradient bar */}
        <div className="bg-gradient-to-r from-rose-500 via-pink-500 to-purple-500 px-4 sm:px-6 pt-4 pb-5">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(-1)}
                className="w-9 h-9 bg-white/20 hover:bg-white/30 rounded-xl flex items-center justify-center transition backdrop-blur-sm"
              >
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-white">Notifications</h1>
                  {unread > 0 && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="px-2 py-0.5 bg-white/25 backdrop-blur-sm text-white text-xs font-bold rounded-full"
                    >
                      {unread} new
                    </motion.span>
                  )}
                </div>
                <p className="text-white/70 text-xs mt-0.5">
                  {notifications.length === 0
                    ? 'Nothing yet'
                    : `${notifications.length} total · ${unread} unread`}
                </p>
              </div>
            </div>

            {unread > 0 && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleMarkAllAsRead}
                className="flex items-center gap-1.5 px-3 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white rounded-xl text-xs font-bold transition"
              >
                <CheckCheck className="w-4 h-4" />
                <span className="hidden sm:inline">Mark all read</span>
                <span className="sm:hidden">Read all</span>
              </motion.button>
            )}
          </div>
        </div>

        {/* Filter pills — overlapping the gradient */}
        <div className="bg-white border-b border-gray-100 shadow-sm">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 py-2.5">
            <div className="flex gap-2 overflow-x-auto scrollbar-hide">
              {FILTERS.map(f => {
                const count = f.id === 'all'
                  ? notifications.length
                  : f.id === 'unread'
                  ? unread
                  : notifications.filter(n => n.type === f.id).length;
                if (count === 0 && f.id !== 'all') return null;
                return (
                  <button
                    key={f.id}
                    onClick={() => setFilter(f.id)}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${
                      filter === f.id
                        ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-sm shadow-rose-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <span>{f.emoji}</span>
                    <span>{f.label}</span>
                    {count > 0 && (
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                        filter === f.id ? 'bg-white/25 text-white' : 'bg-white text-gray-600'
                      }`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-5">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <AnimatePresence initial={false}>
            {filtered.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="py-20 text-center"
              >
                <motion.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                  className="w-20 h-20 bg-gradient-to-br from-rose-50 to-pink-100 rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-inner"
                >
                  <Bell className="w-9 h-9 text-rose-300" />
                </motion.div>
                <p className="text-gray-700 font-bold text-lg">All caught up!</p>
                <p className="text-gray-400 text-sm mt-1">
                  {filter === 'all'
                    ? "You have no notifications yet."
                    : `No ${filter === 'unread' ? 'unread' : filter} notifications.`}
                </p>
              </motion.div>
            ) : (
              <div className="divide-y divide-gray-50">
                {filtered.map((n, i) => (
                  <NotificationRow
                    key={n.id}
                    notification={n}
                    index={i}
                    onDelete={handleDelete}
                    onClick={() => handleClick(n)}
                  />
                ))}
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer hint */}
        {filtered.length > 0 && (
          <p className="text-center text-xs text-gray-400 mt-4">
            Hover a notification to delete it
          </p>
        )}
      </div>
    </div>
  );
}