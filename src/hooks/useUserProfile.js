import { useAuth } from './useAuth';

export const useUserProfile = () => {
  const { currentUser, userProfile, fetchUserProfile } = useAuth();
  
  return {
    user: currentUser,
    profile: userProfile,
    isLoading: !userProfile && currentUser,
    refreshProfile: fetchUserProfile,
    isProfileComplete: userProfile?.profileCompleted || false,
    username: userProfile?.username || null,
    displayName: userProfile?.displayName || currentUser?.email?.split('@')[0] || 'User',
    bio: userProfile?.bio || '',
    avatar: userProfile?.avatar || null,
    isCreator: userProfile?.isCreator || false,
    isVerified: userProfile?.isVerified || false,
    followers: userProfile?.followers || 0,
    following: userProfile?.following || 0,
    postsCount: userProfile?.postsCount || 0
  };
};