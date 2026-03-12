// src/components/Messages/PPVMessageCard.jsx - Locked Message (wallet-based instant unlock)

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Image, Video, Loader2 } from 'lucide-react';
import { unlockPPVMessage, getMessagePreview } from '../../services/ppvMessageService';
import { useAuth } from '../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import logger from '../../utils/logger';

export default function PPVMessageCard({ message, conversationId }) {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [unlocking, setUnlocking] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(
    message.senderId === currentUser?.uid || message.unlockedBy?.includes(currentUser?.uid)
  );

  const handleUnlock = async () => {
    if (!currentUser) {
      alert('Please log in to unlock this message');
      return;
    }
    if (isUnlocked) return;

    try {
      setUnlocking(true);
      await unlockPPVMessage(conversationId, message.id, currentUser.uid);
      setIsUnlocked(true);
    } catch (error) {
      logger.error('Error unlocking message:', error);
      // If insufficient balance, redirect to wallet
      if (error.message?.includes('Insufficient balance') || error.message?.includes('Wallet not found')) {
        const goWallet = window.confirm(
          error.message + '\n\nWould you like to go to your wallet to add funds?'
        );
        if (goWallet) navigate('/wallet');
      } else {
        alert(error.message || 'Failed to unlock message');
      }
    } finally {
      setUnlocking(false);
    }
  };

  // Sender sees their own message
  if (message.senderId === currentUser?.uid) {
    return <NormalMessage message={message} isSender />;
  }

  // Already unlocked
  if (isUnlocked) {
    return <NormalMessage message={message} />;
  }

  // Locked preview
  const preview = getMessagePreview(message);
  const hasMedia = message.mediaUrl && message.mediaType && message.mediaType !== 'text';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-4 mb-3 max-w-xs"
    >
      {/* Blur overlay */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm rounded-2xl flex items-center justify-center pointer-events-none">
        <Lock className="w-10 h-10 text-white/40" />
      </div>

      <div className="relative z-10">
        {hasMedia && (
          <div className="mb-3 flex items-center space-x-2 text-white/70">
            {message.mediaType === 'video' ? (
              <Video className="w-5 h-5" />
            ) : (
              <Image className="w-5 h-5" />
            )}
            <span className="text-sm font-medium">Locked {message.mediaType}</span>
          </div>
        )}

        <p className="text-white/70 text-sm mb-4 filter blur-sm select-none line-clamp-2">
          {preview}
        </p>

        <button
          onClick={handleUnlock}
          disabled={unlocking}
          className="w-full px-4 py-3 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white font-bold rounded-xl transition flex items-center justify-center space-x-2 disabled:opacity-50"
        >
          {unlocking ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Unlocking...</span>
            </>
          ) : (
            <>
              <Lock className="w-4 h-4" />
              <span>Unlock for ${message.unlockPrice}</span>
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}

function NormalMessage({ message, isSender }) {
  return (
    <div className={`rounded-2xl p-3 mb-3 max-w-xs ${isSender ? 'bg-rose-500 text-white ml-auto' : 'bg-white shadow-sm'}`}>
      {message.mediaUrl && message.mediaType && message.mediaType !== 'text' && (
        <div className="mb-2 rounded-xl overflow-hidden">
          {message.mediaType === 'video' ? (
            <video
              src={message.mediaUrl}
              controls
              playsInline
              className="w-full rounded-xl"
              onClick={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.preventDefault()}
            />
          ) : (
            <img
              src={message.mediaUrl}
              alt="Message"
              className="w-full rounded-xl"
              onContextMenu={(e) => e.preventDefault()}
              onDragStart={(e) => e.preventDefault()}
            />
          )}
        </div>
      )}
      {message.content && (
        <p className={`text-sm ${isSender ? 'text-white' : 'text-gray-900'}`}>{message.content}</p>
      )}
      {isSender && (
        <p className="text-xs text-white/60 mt-1 text-right">🔒 Sent locked</p>
      )}
    </div>
  );
}