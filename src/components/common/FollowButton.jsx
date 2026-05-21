// src/components/common/FollowButton.jsx

import { useState, useEffect } from 'react';
import { UserPlus, UserCheck, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { followUser, unfollowUser, isFollowing, getFollowerCount } from '../../services/followService';
import { useAuth } from '../../hooks/useAuth';

export default function FollowButton({ 
  userId, 
  username, 
  size = 'md',
  className = '',
  onFollowChange 
}) {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    checkFollowStatus();
  }, [userId, currentUser]);

  const checkFollowStatus = async () => {
    if (!currentUser || !userId || currentUser.uid === userId) {
      setLoading(false);
      return;
    }

    try {
      const status = await isFollowing(currentUser.uid, userId);
      setFollowing(status);
    } catch (error) {
      console.error('Error checking follow status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFollow = async () => {
    if (!currentUser) {
      navigate('/login');
      return;
    }

    try {
      setActionLoading(true);
      
      if (following) {
        await unfollowUser(currentUser.uid, userId);
        setFollowing(false);
        
        // ✅ Get updated follower count and pass to parent
        if (onFollowChange) {
          const newCount = await getFollowerCount(userId);
          onFollowChange(newCount);
        }
      } else {
        await followUser(currentUser.uid, userId);
        setFollowing(true);
        
        // ✅ Get updated follower count and pass to parent
        if (onFollowChange) {
          const newCount = await getFollowerCount(userId);
          onFollowChange(newCount);
        }
      }
    } catch (error) {
      console.error('Error toggling follow:', error);
      alert('Failed to update follow status');
    } finally {
      setActionLoading(false);
    }
  };

  // Don't show button for own profile
  if (currentUser && currentUser.uid === userId) {
    return null;
  }

  if (loading) {
    return (
      <button
        disabled
        className={`inline-flex items-center justify-center space-x-2 px-4 py-2 rounded-lg font-semibold transition ${
          size === 'sm' ? 'text-sm px-3 py-1.5' : 
          size === 'lg' ? 'text-lg px-6 py-3' : ''
        } bg-gray-200 text-gray-400 cursor-not-allowed ${className}`}
      >
        <Loader2 className={`${size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} animate-spin`} />
      </button>
    );
  }

  return (
    <button
      onClick={handleFollow}
      disabled={actionLoading}
      className={`inline-flex items-center justify-center space-x-2 rounded-lg font-semibold transition disabled:opacity-50 ${
        size === 'sm' ? 'text-sm px-3 py-1.5' : 
        size === 'lg' ? 'text-lg px-6 py-3' : 
        'px-4 py-2'
      } ${
        following
          ? 'bg-gray-200 hover:bg-gray-300 text-gray-700'
          : 'bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white shadow-lg'
      } ${className}`}
    >
      {actionLoading ? (
        <>
          <Loader2 className={`${size === 'sm' ? 'w-3 h-3' : size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'} animate-spin`} />
          <span>{following ? 'Unfollowing...' : 'Following...'}</span>
        </>
      ) : (
        <>
          {following ? (
            <>
              <UserCheck className={size === 'sm' ? 'w-3 h-3' : size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'} />
              <span>Following</span>
            </>
          ) : (
            <>
              <UserPlus className={size === 'sm' ? 'w-3 h-3' : size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'} />
              <span>Follow</span>
            </>
          )}
        </>
      )}
    </button>
  );
}
