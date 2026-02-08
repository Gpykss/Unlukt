// src/pages/CreatorProfile/CreatorProfile.jsx

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Heart, 
  MessageCircle, 
  Settings,
  ArrowLeft,
  Lock,
  Star,
  MapPin,
  Calendar,
  Link as LinkIcon,
  MoreVertical
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getUserProfile, getUserByUsername } from '../../services/firestoreService';
import { getUserPosts } from '../../services/postService';
import FollowButton from '../../components/common/FollowButton';
import ContentViewModal from '../../components/common/ContentViewModal';
import { Archive } from 'lucide-react';

export default function CreatorProfile() {
  const navigate = useNavigate();
  const { username } = useParams();
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState('posts');
  const [archivedPosts, setArchivedPosts] = useState([]);
  const [selectedPost, setSelectedPost] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [creator, setCreator] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubscribed, setIsSubscribed] = useState(false);

  // Check if viewing own profile
  const isOwnProfile = currentUser && creator && currentUser.uid === creator.uid;

  useEffect(() => {
    loadCreatorData();
  }, [username]);

  const loadCreatorData = async () => {
    try {
      setLoading(true);
      
      // ✅ Fetch the creator data based on username from URL params
      let foundCreator;
      
      if (username) {
        // If viewing another user's profile via username
        foundCreator = await getUserByUsername(username);
      } else if (currentUser) {
        // If viewing own profile (no username in URL)
        foundCreator = await getUserProfile(currentUser.uid);
      }
      
      if (foundCreator) {
        setCreator({
          uid: foundCreator.uid || foundCreator.id,
          username: foundCreator.username,
          name: foundCreator.displayName || foundCreator.name,
          avatar: foundCreator.avatar || foundCreator.photoURL || '👤',
          banner: foundCreator.banner || '🎨',
          bio: foundCreator.bio || 'No bio yet',
          location: foundCreator.location || 'Location',
          joined: foundCreator.createdAt ? new Date(foundCreator.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Recently',
          website: foundCreator.website || '',
          verified: foundCreator.verified || false,
          followers: foundCreator.followersCount || 0,
          following: foundCreator.followingCount || 0,
          postsCount: 0, // Will be updated after loading posts
          subscriptionPrice: foundCreator.subscriptionPrice || 9.99
        });
        
        // Load creator's posts
        console.log('📝 Loading posts for user:', foundCreator.uid || foundCreator.id);
        const userPosts = await getUserPosts(foundCreator.uid || foundCreator.id);
        console.log(`✅ Loaded ${userPosts.length} posts`);
        
        // ✅ Separate archived and active posts
        const activePosts = userPosts.filter(post => !post.archived);
        const archived = userPosts.filter(post => post.archived);
        
        setPosts(activePosts);
        setArchivedPosts(archived);
        
        // Update post count (only active posts)
        setCreator(prev => ({
          ...prev,
          postsCount: activePosts.length
        }));
      } else {
        console.error('❌ Creator not found');
        setCreator(null);
      }
      
    } catch (error) {
      console.error('Error loading creator:', error);
      setCreator(null);
    } finally {
      setLoading(false);
    }
  };

  // ✅ Handle follower count updates from FollowButton
  const handleFollowChange = async () => {
    // Reload the creator data to get fresh follower count
    try {
      let foundCreator;
      
      if (username) {
        foundCreator = await getUserByUsername(username);
      } else if (currentUser) {
        foundCreator = await getUserProfile(currentUser.uid);
      }
      
      if (foundCreator) {
        setCreator(prev => ({
          ...prev,
          followers: foundCreator.followersCount || foundCreator.followers || 0,
          following: foundCreator.followingCount || foundCreator.following || 0
        }));
      }
    } catch (error) {
      console.error('Error updating follower count:', error);
    }
  };

  const handleMessage = () => {
    navigate('/messages');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!creator) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Creator Not Found</h2>
          <p className="text-gray-600 mb-6">This creator doesn't exist or has been removed.</p>
          <button
            onClick={() => navigate('/feed')}
            className="px-6 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-semibold transition"
          >
            Back to Feed
          </button>
        </div>
      </div>
    );
  }

  const handlePostUpdate = (updatedPost) => {
    if (updatedPost === null) {
      // Post was deleted - remove it from the list
      setPosts(prevPosts => prevPosts.filter(p => p.id !== selectedPost?.id));
      setSelectedPost(null);
      setIsModalOpen(false);
    } else {
      // Post was updated - update it in the list
      setPosts(prevPosts => 
        prevPosts.map(p => p.id === updatedPost.id ? updatedPost : p)
      );
      setSelectedPost(updatedPost);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20 lg:pb-8">
      {/* Mobile Header */}
      <div className="lg:hidden bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">@{creator.username}</h1>
          <button className="p-2 hover:bg-gray-100 rounded-lg transition">
            <MoreVertical className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Desktop Back Button */}
      <div className="hidden lg:block bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <button
            onClick={() => navigate('/feed')}
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">Back to Feed</span>
          </button>
        </div>
      </div>

      {/* Profile Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto">
          {/* Banner */}
          <div className="relative h-48 sm:h-56 md:h-64 bg-gradient-to-br from-rose-200 via-pink-200 to-purple-200 flex items-center justify-center">
            <span className="text-6xl sm:text-7xl md:text-9xl">{creator.banner}</span>
          </div>

          {/* Profile Info */}
          <div className="px-4 sm:px-6 pb-4 sm:pb-6">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between -mt-12 sm:-mt-16 mb-4 sm:mb-6">
              {/* Avatar */}
              <div className="flex items-end space-x-4 sm:space-x-6">
                <div className="relative">
                  <div className="w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 rounded-full bg-gradient-to-br from-rose-100 to-pink-100 border-4 border-white flex items-center justify-center text-4xl sm:text-5xl md:text-6xl shadow-lg">
                    {creator.avatar}
                  </div>
                  {creator.verified && (
                    <div className="absolute bottom-1 right-1 sm:bottom-2 sm:right-2 bg-blue-500 text-white p-1 sm:p-1.5 rounded-full border-2 border-white">
                      <Star className="w-3 h-3 sm:w-4 sm:h-4 fill-white" />
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2 sm:space-x-3 mt-4 sm:mt-0">
                {!isOwnProfile && (
                  <>
                    <button 
                      onClick={handleMessage}
                      className="p-2 sm:p-3 rounded-full border-2 border-gray-200 hover:bg-gray-50 transition"
                    >
                      <MessageCircle className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                    </button>
                    
                    {/* Follow Button with callback */}
                    <FollowButton 
                      userId={creator.uid}
                      username={creator.username}
                      size="md"
                      onFollowChange={handleFollowChange}
                    />
                    
                    {/* Subscribe Button */}
                    <button
                      onClick={() => setIsSubscribed(!isSubscribed)}
                      className={`px-4 sm:px-6 md:px-8 py-2 sm:py-2.5 md:py-3 rounded-full font-bold text-sm sm:text-base transition shadow-lg ${
                        isSubscribed
                          ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          : 'bg-gradient-to-r from-rose-500 to-pink-600 text-white hover:from-rose-600 hover:to-pink-700'
                      }`}
                    >
                      <span className="hidden sm:inline">
                        {isSubscribed ? 'Subscribed' : `Subscribe • $${creator.subscriptionPrice}/mo`}
                      </span>
                      <span className="sm:hidden">
                        {isSubscribed ? 'Subscribed' : 'Subscribe'}
                      </span>
                    </button>
                  </>
                )}
                {isOwnProfile && (
                  <>
                    <button 
                      onClick={() => navigate('/settings')}
                      className="p-2 sm:p-3 rounded-full border-2 border-gray-200 hover:bg-gray-50 transition"
                    >
                      <Settings className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                    </button>
                    <button
                      onClick={() => navigate('/settings')}
                      className="px-6 sm:px-8 py-2 sm:py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-full font-bold text-sm sm:text-base transition"
                    >
                      Edit Profile
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Creator Name & Username */}
            <div className="mb-3 sm:mb-4">
              <div className="flex items-center space-x-2 mb-1">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{creator.name}</h1>
                {creator.verified && (
                  <div className="bg-blue-500 text-white p-1 rounded-full">
                    <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </div>
              <p className="text-gray-600 text-base sm:text-lg">@{creator.username}</p>
            </div>

            {/* Stats */}
            <div className="flex items-center flex-wrap gap-4 sm:gap-6 md:gap-8 mb-4 sm:mb-6">
              <div>
                <span className="text-xl sm:text-2xl font-bold text-gray-900">{creator.postsCount}</span>
                <span className="text-gray-600 ml-2 text-sm sm:text-base">Posts</span>
              </div>
              <div>
                <span className="text-xl sm:text-2xl font-bold text-gray-900">{creator.followers}</span>
                <span className="text-gray-600 ml-2 text-sm sm:text-base">Followers</span>
              </div>
              <div>
                <span className="text-xl sm:text-2xl font-bold text-gray-900">{creator.following}</span>
                <span className="text-gray-600 ml-2 text-sm sm:text-base">Following</span>
              </div>
            </div>

            {/* Bio */}
            <div className="mb-3 sm:mb-4">
              <p className="text-sm sm:text-base text-gray-700 leading-relaxed">{creator.bio}</p>
            </div>

            {/* Additional Info */}
            <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs sm:text-sm text-gray-600">
              <div className="flex items-center space-x-1 sm:space-x-2">
                <MapPin className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>{creator.location}</span>
              </div>
              <div className="flex items-center space-x-1 sm:space-x-2">
                <Calendar className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>Joined {creator.joined}</span>
              </div>
              {creator.website && (
                <div className="flex items-center space-x-1 sm:space-x-2">
                  <LinkIcon className="w-3 h-3 sm:w-4 sm:h-4" />
                  <a href={`https://${creator.website}`} target="_blank" rel="noopener noreferrer" className="text-rose-500 hover:text-rose-600 font-medium">
                    {creator.website}
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content Tabs */}
      <div className="bg-white border-b border-gray-200 sticky top-0 lg:top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex space-x-4 sm:space-x-8 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setActiveTab('posts')}
              className={`py-3 sm:py-4 font-semibold border-b-2 transition whitespace-nowrap text-sm sm:text-base ${
                activeTab === 'posts'
                  ? 'border-rose-500 text-rose-500'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Posts
            </button>
            <button
              onClick={() => setActiveTab('media')}
              className={`py-3 sm:py-4 font-semibold border-b-2 transition whitespace-nowrap text-sm sm:text-base ${
                activeTab === 'media'
                  ? 'border-rose-500 text-rose-500'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Media
            </button>
            <button
              onClick={() => setActiveTab('likes')}
              className={`py-3 sm:py-4 font-semibold border-b-2 transition whitespace-nowrap text-sm sm:text-base ${
                activeTab === 'likes'
                  ? 'border-rose-500 text-rose-500'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Likes
            </button>
            {/* ✅ ADD ARCHIVE TAB - Only visible on own profile */}
            {isOwnProfile && (
              <button
                onClick={() => setActiveTab('archive')}
                className={`py-3 sm:py-4 font-semibold border-b-2 transition whitespace-nowrap text-sm sm:text-base ${
                  activeTab === 'archive'
                    ? 'border-rose-500 text-rose-500'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Archive {archivedPosts.length > 0 && `(${archivedPosts.length})`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {posts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">No posts yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3 md:gap-4">
            {posts.map((post, index) => (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => {
                  if (!post.isLocked || isOwnProfile) {
                    setSelectedPost(post);
                    setIsModalOpen(true);
                  }
                }}
                className="relative group cursor-pointer"
              >
                <div className="aspect-square bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg sm:rounded-xl overflow-hidden">
                  {post.images && post.images.length > 0 ? (
                    <img 
                      src={post.images[0]} 
                      alt="Post" 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl sm:text-5xl md:text-6xl">
                      📸
                    </div>
                  )}

                  {/* Locked Overlay */}
                  {post.isLocked && !isOwnProfile && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
                      <Lock className="w-8 h-8 sm:w-12 sm:h-12 text-white" />
                    </div>
                  )}

                  {/* Hover Overlay with Stats */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center space-x-4 sm:space-x-6">
                    <div className="flex items-center space-x-1 sm:space-x-2 text-white">
                      <Heart className="w-5 h-5 sm:w-6 sm:h-6 fill-white" />
                      <span className="font-bold text-sm sm:text-base">{post.likes || 0}</span>
                    </div>
                    <div className="flex items-center space-x-1 sm:space-x-2 text-white">
                      <MessageCircle className="w-5 h-5 sm:w-6 sm:h-6 fill-white" />
                      <span className="font-bold text-sm sm:text-base">{post.comments || 0}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Load More */}
        {posts.length >= 20 && (
          <div className="text-center mt-8">
            <button className="bg-white border-2 border-gray-200 hover:border-gray-300 text-gray-700 px-6 sm:px-8 py-2.5 sm:py-3 rounded-lg font-semibold text-sm sm:text-base transition">
              Load More
            </button>
          </div>
        )}
      </div>

      {/* Content View Modal */}
      <ContentViewModal 
        isOpen={isModalOpen} 
        onClose={() => {
          setIsModalOpen(false);
          setSelectedPost(null);
        }} 
        post={selectedPost}
        onPostUpdate={handlePostUpdate}
      />
    </div>
  );
}