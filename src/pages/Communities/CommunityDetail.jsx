// src/pages/Communities/CommunityDetail.jsx - View Community Details

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft,
  Users,
  Lock,
  Globe,
  Settings,
  UserPlus,
  MessageSquare,
  Image as ImageIcon,
  Send,
  Loader2,
  MoreVertical,
  X,
  Crown
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { 
  getCommunity,
  getCommunityMembers,
  getCommunityPosts,
  joinCommunity,
  leaveCommunity,
  isCommunityMember,
  createCommunityPost
} from '../../services/communityService';
import { uploadToBunny as uploadMedia } from '../../services/bunnyUpload.service';
import { getUserProfile } from '../../services/firestoreService';

export default function CommunityDetail() {
  const navigate = useNavigate();
  const { communityId } = useParams();
  const { currentUser } = useAuth();
  
  const [community, setCommunity] = useState(null);
  const [members, setMembers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isMember, setIsMember] = useState(false);
  const [joining, setJoining] = useState(false);
  const [activeTab, setActiveTab] = useState('posts'); // posts or members
  
  // Create post state
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [postContent, setPostContent] = useState('');
  const [postImages, setPostImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);

  const isOwner = community && currentUser && community.creatorId === currentUser.uid;

  useEffect(() => {
    loadCommunityData();
  }, [communityId, currentUser]);

  const loadCommunityData = async () => {
    try {
      setLoading(true);
      
      // Load community details
      const communityData = await getCommunity(communityId);
      if (!communityData) {
        navigate('/communities');
        return;
      }
      setCommunity(communityData);
      
      // Check membership
      if (currentUser) {
        const memberStatus = await isCommunityMember(currentUser.uid, communityId);
        setIsMember(memberStatus);
        
        // Load posts and members if user is a member or owner
        if (memberStatus || communityData.creatorId === currentUser.uid) {
          const [postsData, membersData] = await Promise.all([
            getCommunityPosts(communityId),
            getCommunityMembers(communityId)
          ]);
          setPosts(postsData);
          setMembers(membersData);
        }
      }
    } catch (error) {
      console.error('Error loading community:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!currentUser) {
      alert('Please login to join communities');
      navigate('/login');
      return;
    }

    try {
      setJoining(true);
      
      // Navigate to payment page
      navigate('/wallet', {
        state: {
          action: 'join-community',
          communityId: community.id,
          communityName: community.name,
          price: community.price
        }
      });
    } catch (error) {
      console.error('Error joining community:', error);
      alert('Failed to join community');
    } finally {
      setJoining(false);
    }
  };

  const handleLeave = async () => {
    const confirmed = window.confirm('Are you sure you want to leave this community?');
    if (!confirmed) return;

    try {
      await leaveCommunity(currentUser.uid, communityId);
      setIsMember(false);
      alert('You have left the community');
      navigate('/communities');
    } catch (error) {
      console.error('Error leaving community:', error);
      alert('Failed to leave community');
    }
  };

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    if (postImages.length + files.length > 4) {
      alert('Maximum 4 images allowed');
      return;
    }

    try {
      setUploading(true);
      
      const uploadPromises = files.map(file => 
        uploadMedia(file, 'community-posts')
      );
      
      const results = await Promise.all(uploadPromises);
      const urls = results.map(r => r.url);
      
      setPostImages([...postImages, ...urls]);
    } catch (error) {
      console.error('Error uploading images:', error);
      alert('Failed to upload images');
    } finally {
      setUploading(false);
    }
  };

  const handleCreatePost = async () => {
    if (!postContent.trim() && postImages.length === 0) {
      alert('Please add some content or images');
      return;
    }

    try {
      setPosting(true);
      
      await createCommunityPost(communityId, currentUser.uid, {
        content: postContent,
        images: postImages
      });
      
      // Reload posts
      const postsData = await getCommunityPosts(communityId);
      setPosts(postsData);
      
      // Reset form
      setPostContent('');
      setPostImages([]);
      setShowCreatePost(false);
      
      alert('Post created successfully!');
    } catch (error) {
      console.error('Error creating post:', error);
      alert('Failed to create post');
    } finally {
      setPosting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-rose-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading community...</p>
        </div>
      </div>
    );
  }

  if (!community) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Community Not Found</h2>
          <button
            onClick={() => navigate('/communities')}
            className="px-6 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-semibold transition"
          >
            Back to Communities
          </button>
        </div>
      </div>
    );
  }

  const canViewContent = isMember || isOwner;

  return (
    <div className="min-h-screen bg-gray-50 pb-20 lg:pb-8">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto">
          {/* Cover Image */}
          <div className="relative h-48 sm:h-56 md:h-64 bg-gradient-to-br from-rose-200 via-pink-200 to-purple-200">
            {community.coverImage && (
              <img 
                src={community.coverImage} 
                alt={community.name}
                className="w-full h-full object-cover"
              />
            )}
            
            {/* Back Button */}
            <button
              onClick={() => navigate('/communities')}
              className="absolute top-4 left-4 p-2 bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded-lg transition text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            {/* Settings Button (Owner Only) */}
            {isOwner && (
              <button
                onClick={() => navigate(`/community/${communityId}/settings`)}
                className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded-lg transition text-white"
              >
                <Settings className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Community Info */}
          <div className="px-4 sm:px-6 py-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-2">
                  <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                    {community.name}
                  </h1>
                  {community.isPrivate ? (
                    <Lock className="w-5 h-5 text-gray-600" />
                  ) : (
                    <Globe className="w-5 h-5 text-gray-600" />
                  )}
                </div>
                
                <p className="text-gray-600 mb-3">
                  {community.description || 'No description'}
                </p>

                <div className="flex items-center space-x-4 text-sm text-gray-600">
                  <div className="flex items-center space-x-1">
                    <Users className="w-4 h-4" />
                    <span>{community.memberCount || 0} members</span>
                  </div>
                  <span className="px-2 py-1 bg-rose-50 text-rose-600 text-xs font-medium rounded-full">
                    {community.category || 'general'}
                  </span>
                </div>
              </div>

              {/* Join/Leave Button */}
              {!isOwner && (
                <div className="ml-4">
                  {isMember ? (
                    <button
                      onClick={handleLeave}
                      className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-semibold transition"
                    >
                      Leave
                    </button>
                  ) : (
                    <button
                      onClick={handleJoin}
                      disabled={joining}
                      className="px-6 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-semibold transition disabled:opacity-50 flex items-center space-x-2"
                    >
                      {joining ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Joining...</span>
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-5 h-5" />
                          <span>Join • ${community.price}/mo</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        {!canViewContent ? (
          /* Not a Member - Show Preview */
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
            <Lock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              Join to Access Exclusive Content
            </h3>
            <p className="text-gray-600 mb-6">
              Become a member to view posts, interact with other members, and get exclusive content.
            </p>
            <button
              onClick={handleJoin}
              className="px-8 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-semibold transition inline-flex items-center space-x-2"
            >
              <UserPlus className="w-5 h-5" />
              <span>Join Community for ${community.price}/month</span>
            </button>
          </div>
        ) : (
          /* Member View */
          <>
            {/* Tabs */}
            <div className="bg-white rounded-2xl border border-gray-200 mb-6 p-1 flex space-x-1">
              <button
                onClick={() => setActiveTab('posts')}
                className={`flex-1 py-2 rounded-lg font-semibold transition ${
                  activeTab === 'posts'
                    ? 'bg-rose-500 text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                Posts
              </button>
              <button
                onClick={() => setActiveTab('members')}
                className={`flex-1 py-2 rounded-lg font-semibold transition ${
                  activeTab === 'members'
                    ? 'bg-rose-500 text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                Members ({members.length})
              </button>
            </div>

            {activeTab === 'posts' ? (
              /* Posts Tab */
              <div className="space-y-6">
                {/* Create Post Button */}
                {isMember && (
                  <button
                    onClick={() => setShowCreatePost(true)}
                    className="w-full bg-white rounded-2xl border border-gray-200 hover:border-rose-300 p-4 text-left transition"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center text-white font-bold">
                        {currentUser?.displayName?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                      <p className="text-gray-500">Share something with the community...</p>
                    </div>
                  </button>
                )}

                {/* Posts List */}
                {posts.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
                    <MessageSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No posts yet</h3>
                    <p className="text-gray-600">Be the first to share something!</p>
                  </div>
                ) : (
                  posts.map((post) => (
                    <CommunityPostCard key={post.id} post={post} />
                  ))
                )}
              </div>
            ) : (
              /* Members Tab */
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Members ({members.length})
                </h3>
                
                {members.length === 0 ? (
                  <p className="text-gray-600 text-center py-8">No members yet</p>
                ) : (
                  <div className="space-y-3">
                    {members.map((member) => (
                      <div key={member.id} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-100 to-pink-100 flex items-center justify-center text-lg overflow-hidden">
                            {member.user.avatar ? (
                              <img 
                                src={member.user.avatar} 
                                alt={member.user.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              '👤'
                            )}
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <p className="font-semibold text-gray-900">{member.user.name}</p>
                              {member.role === 'admin' && (
                                <Crown className="w-4 h-4 text-yellow-500" />
                              )}
                            </div>
                            {member.user.username && (
                              <p className="text-sm text-gray-500">@{member.user.username}</p>
                            )}
                          </div>
                        </div>
                        
                        <button
                          onClick={() => navigate(`/creator/${member.user.username}`)}
                          className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition"
                        >
                          View Profile
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Post Modal */}
      <AnimatePresence>
        {showCreatePost && (
          <div 
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
            onClick={() => setShowCreatePost(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-gray-900">Create Post</h3>
                  <button
                    onClick={() => setShowCreatePost(false)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition"
                  >
                    <X className="w-5 h-5 text-gray-600" />
                  </button>
                </div>

                <textarea
                  value={postContent}
                  onChange={(e) => setPostContent(e.target.value)}
                  placeholder="What's on your mind?"
                  rows="5"
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 transition resize-none mb-4"
                />

                {/* Image Previews */}
                {postImages.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {postImages.map((url, index) => (
                      <div key={index} className="relative aspect-square">
                        <img 
                          src={url} 
                          alt={`Upload ${index + 1}`}
                          className="w-full h-full object-cover rounded-lg"
                        />
                        <button
                          onClick={() => setPostImages(postImages.filter((_, i) => i !== index))}
                          className="absolute top-2 right-2 p-1 bg-black/50 hover:bg-black/70 rounded-full transition"
                        >
                          <X className="w-4 h-4 text-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <label className="flex items-center space-x-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer transition">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImageUpload}
                      className="hidden"
                      disabled={uploading || postImages.length >= 4}
                    />
                    {uploading ? (
                      <>
                        <Loader2 className="w-5 h-5 text-gray-600 animate-spin" />
                        <span className="text-sm text-gray-600">Uploading...</span>
                      </>
                    ) : (
                      <>
                        <ImageIcon className="w-5 h-5 text-gray-600" />
                        <span className="text-sm text-gray-600">Add Images</span>
                      </>
                    )}
                  </label>

                  <button
                    onClick={handleCreatePost}
                    disabled={posting || (!postContent.trim() && postImages.length === 0)}
                    className="px-6 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                  >
                    {posting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Posting...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-5 h-5" />
                        <span>Post</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Community Post Card Component
function CommunityPostCard({ post }) {
  const [author, setAuthor] = useState(null);

  useEffect(() => {
    loadAuthor();
  }, [post.authorId]);

  const loadAuthor = async () => {
    try {
      const userData = await getUserProfile(post.authorId);
      setAuthor(userData);
    } catch (error) {
      console.error('Error loading author:', error);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      {/* Author Info */}
      <div className="flex items-center space-x-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-100 to-pink-100 flex items-center justify-center text-lg overflow-hidden">
          {author?.avatar ? (
            <img src={author.avatar} alt={author.displayName} className="w-full h-full object-cover" />
          ) : (
            '👤'
          )}
        </div>
        <div>
          <p className="font-semibold text-gray-900">{author?.displayName || 'Loading...'}</p>
          <p className="text-sm text-gray-500">
            {post.createdAt?.toDate ? 
              post.createdAt.toDate().toLocaleDateString() : 
              'Recently'}
          </p>
        </div>
      </div>

      {/* Content */}
      {post.content && (
        <p className="text-gray-700 mb-4 whitespace-pre-wrap">{post.content}</p>
      )}

      {/* Images */}
      {post.images && post.images.length > 0 && (
        <div className={`grid gap-2 mb-4 ${
          post.images.length === 1 ? 'grid-cols-1' : 
          post.images.length === 2 ? 'grid-cols-2' : 
          'grid-cols-2'
        }`}>
          {post.images.map((url, index) => (
            <img 
              key={index}
              src={url} 
              alt={`Post image ${index + 1}`}
              className="w-full h-48 object-cover rounded-lg"
            />
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center space-x-4 text-sm text-gray-600">
        <button className="flex items-center space-x-1 hover:text-rose-500 transition">
          <MessageSquare className="w-5 h-5" />
          <span>{post.commentCount || 0}</span>
        </button>
      </div>
    </div>
  );
}