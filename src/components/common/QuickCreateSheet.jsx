// src/components/common/QuickCreateSheet.jsx
// Implements PRD Section 15.2: Center Create button quick sheet
// Styled in Unlukt's clean light design system.

import { motion, AnimatePresence } from 'framer-motion';
import { X, Image, Video, Radio, Phone, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function QuickCreateSheet({ isOpen, onClose }) {
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleAction = (path) => {
    onClose();
    navigate(path);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs"
        />

        {/* Modal / Elevated Sheet */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-md bg-white border border-gray-200 rounded-3xl p-6 shadow-2xl z-10 text-gray-900 mx-auto"
        >

          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Create & Monetize</h3>
              <p className="text-xs text-gray-500">Choose what you want to share today</p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {/* New Post */}
            <button
              onClick={() => handleAction('/new-post')}
              className="flex items-center gap-4 p-4 rounded-2xl bg-gray-50 hover:bg-gray-100/80 border border-gray-200/80 transition group text-left active:scale-[0.99] shadow-xs"
            >
              <div className="w-11 h-11 rounded-xl bg-gradient-to-r from-red-500 to-rose-500 flex items-center justify-center text-white shadow-sm">
                <Image className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-900 group-hover:text-red-600 transition">
                  New Post
                </p>
                <p className="text-xs text-gray-500">
                  Photos, video clips, teasers, or pay-per-view
                </p>
              </div>
            </button>

            {/* Live Call Slots / Availability */}
            <button
              onClick={() => handleAction('/dashboard')}
              className="flex items-center gap-4 p-4 rounded-2xl bg-gray-50 hover:bg-gray-100/80 border border-gray-200/80 transition group text-left active:scale-[0.99] shadow-xs"
            >
              <div className="w-11 h-11 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-sm">
                <Phone className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-900 group-hover:text-emerald-600 transition">
                  Call Availability
                </p>
                <p className="text-xs text-gray-500">
                  Go online for 1-on-1 video & voice calls
                </p>
              </div>
            </button>

            {/* Go Live Stream */}
            <button
              onClick={() => handleAction('/dashboard')}
              className="flex items-center gap-4 p-4 rounded-2xl bg-gray-50 hover:bg-gray-100/80 border border-gray-200/80 transition group text-left active:scale-[0.99] shadow-xs"
            >
              <div className="w-11 h-11 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 flex items-center justify-center text-white shadow-sm">
                <Radio className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-900 group-hover:text-purple-600 transition">
                  Livestream Room
                </p>
                <p className="text-xs text-gray-500">
                  Broadcast live with tickets, tips & co-hosting
                </p>
              </div>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
