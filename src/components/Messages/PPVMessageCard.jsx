// src/components/Messages/PPVMessageCard.jsx - Locked Message Component

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Image, Video, Loader2 } from 'lucide-react';
import { hasUnlockedMessage, unlockPPVMessage, getMessagePreview } from '../../services/ppvMessageService';
import { useAuth } from '../../hooks/useAuth';
import logger from '../../utils/logger';

export default function PPVMessageCard({ message, conversationId, onUnlock }) {
  const { currentUser, userProfile } = useAuth();
  const [unlocking, setUnlocking] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(
    message.senderId === currentUser?.uid || message.unlockedBy?.includes(currentUser?.uid)
  );

  const handleUnlock = async () => {
    if (!currentUser || !userProfile) {
      alert('Please log in to unlock this message');
      return;
    }

    if (isUnlocked) return;

    try {
      setUnlocking(true);

      const payment = await unlockPPVMessage(
        conversationId,
        message.id,
        currentUser.uid,
        userProfile.email,
        userProfile.displayName || 'User',
        userProfile.location?.countryCode || 'US'
      );

      // Show payment modal
      if (onUnlock) {
        onUnlock(payment);
      }

      logger.success('PPV unlock payment initiated');
    } catch (error) {
      logger.error('Error unlocking message:', error);
      alert(error.message || 'Failed to unlock message');
    } finally {
      setUnlocking(false);
    }
  };

  // If sender, show unlocked
  if (message.senderId === currentUser?.uid) {
    return <NormalMessage message={message} />;
  }

  // If already unlocked, show content
  if (isUnlocked) {
    return <NormalMessage message={message} />;
  }

  // Show locked preview
  const preview = getMessagePreview(message);
  const hasMedia = message.mediaUrl && message.mediaType;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-4 mb-3"
    >
      {/* Lock Overlay */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm rounded-2xl flex items-center justify-center pointer-events-none">
        <Lock className="w-12 h-12 text-white/50" />
      </div>

      {/* Content Preview */}
      <div className="relative z-10">
        {hasMedia && (
          <div className="mb-3 flex items-center space-x-2 text-white/70">
            {message.mediaType === 'video' ? (
              <Video className="w-5 h-5" />
            ) : (
              <Image className="w-5 h-5" />
            )}
            <span className="text-sm font-medium">
              Locked {message.mediaType}
            </span>
          </div>
        )}

        <p className="text-white/80 text-sm mb-4 filter blur-sm select-none">
          {preview}
        </p>

        {/* Unlock Button */}
        <button
          onClick={handleUnlock}
          disabled={unlocking}
          className="w-full px-4 py-3 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white font-bold rounded-xl transition flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {unlocking ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Processing...</span>
            </>
          ) : (
            <>
              <Lock className="w-5 h-5" />
              <span>Unlock for ${message.unlockPrice}</span>
            </>
          )}
        </button>
      </div>

      {/* Decorative Elements */}
      <div className="absolute top-4 right-4 text-white/30">
        <Lock className="w-6 h-6" />
      </div>
    </motion.div>
  );
}

// Normal unlocked message
function NormalMessage({ message }) {
  return (
    <div className="bg-white rounded-2xl p-4 mb-3 shadow-sm">
      {message.mediaUrl && (
        <div className="mb-3 rounded-xl overflow-hidden">
          {message.mediaType === 'video' ? (
            <video 
              src={message.mediaUrl} 
              controls 
              className="w-full"
              onContextMenu={(e) => e.preventDefault()}
            />
          ) : (
            <img 
              src={message.mediaUrl} 
              alt="Message" 
              className="w-full"
              onContextMenu={(e) => e.preventDefault()}
              onDragStart={(e) => e.preventDefault()}
            />
          )}
        </div>
      )}
      
      {message.content && (
        <p className="text-gray-900">{message.content}</p>
      )}
    </div>
  );
}
