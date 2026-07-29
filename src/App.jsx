// src/App.jsx

import { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider, AuthContext } from './contexts/AuthContext';
import { ContentSettingsProvider } from './contexts/ContentSettingsContext';
import { DataLiteProvider } from './contexts/DataLiteContext';
import { useAuth } from './hooks/useAuth';

import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import LoadingScreen from './components/common/LoadingScreen';
import LoadingSpinner from './components/common/LoadingSpinner';
import ScrollToTop from './components/ScrollToTop';
import GlobalSidebar from './layout/GlobalSidebar';
import MobileNavbar from './layout/MobileNavbar';
import MobileBottomNav from './layout/MobileBottomNav';
import DiscoverSidebar from './components/discover/DiscoverSidebar';

// Pages - Critical path pages (loaded synchronously)
import Landing from './pages/Landing/Landing';
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import CreatorProfile from './pages/CreatorProfile/CreatorProfile';

// Pages - Non-critical / Heavy internal views (loaded lazily)
const VerifyEmail = lazy(() => import('./pages/Auth/VerifyEmail'));
const Feed = lazy(() => import('./pages/Feed/Feed'));
const Dashboard = lazy(() => import('./pages/Dashboard/Dashboard'));
const CreatorAnalytics = lazy(() => import('./pages/Analytics/Analytics'));
const Wallet = lazy(() => import('./pages/Wallet/Wallet'));
const PaymentSuccess = lazy(() => import('./pages/Wallet/PaymentSuccess'));
const Settings = lazy(() => import('./pages/Settings/Settings'));
const SearchPage = lazy(() => import('./pages/Search/Search'));
const Discover = lazy(() => import('./pages/Discover/Discover'));
const NotificationsPage = lazy(() => import('./pages/Notifications/Notifications'));
const MessagesPage = lazy(() => import('./pages/Messages/Messages'));
const NewPost = lazy(() => import('./pages/NewPost/NewPost'));
const CompleteProfile = lazy(() => import('./pages/Profile/CompleteProfile'));
const EditProfile = lazy(() => import('./pages/Profile/EditProfile'));
const BecomeCreator = lazy(() => import('./pages/CreatorProfile/BecomeCreator'));
const TermsAndConditions = lazy(() => import('./pages/Legal/TermsAndConditions'));
const PrivacyPolicy = lazy(() => import('./pages/Legal/PrivacyPolicy'));
const HelpCenter = lazy(() => import('./pages/Legal/HelpCenter'));
const AboutUs = lazy(() => import('./pages/Legal/AboutUs'));
const Communities = lazy(() => import('./pages/Communities/Communities'));
const CommunityDetail = lazy(() => import('./pages/Communities/CommunityDetail'));
const CreateCommunity = lazy(() => import('./pages/Communities/CreateCommunity'));
const CommunitySettings = lazy(() => import('./pages/Communities/CommunitySettings'));
const Support = lazy(() => import('./pages/Support/Support'));
const VideoCallRoom = lazy(() => import('./pages/VideoCall/VideoCallRoom'));
const VoiceCallRoom = lazy(() => import('./pages/VideoCall/VoiceCallRoom'));
const BookVideoCall = lazy(() => import('./pages/VideoCall/BookVideoCall'));
const BookVoiceCall = lazy(() => import('./pages/VideoCall/BookVoiceCall'));
const MyCalls = lazy(() => import('./pages/MyCalls/MyCalls'));
const CallWaitingRoom = lazy(() => import('./pages/VideoCall/CallWaitingRoom'));
const CallSummary = lazy(() => import('./pages/VideoCall/CallSummary'));
const LivestreamRoom = lazy(() => import('./pages/VideoCall/LivestreamRoom'));

// ✅ Admin Pages (loaded lazily)
const Admin = lazy(() => import('./pages/Admin/Admin'));
const KYCManagement = lazy(() => import('./pages/Admin/KYCManagement'));
const UserManagement = lazy(() => import('./pages/Admin/UserManagement'));
const AdminAnalytics = lazy(() => import('./pages/Admin/Analytics'));
const NowPaymentsLogs = lazy(() => import('./pages/Admin/NowPaymentsLogs'));
const CryptoPayments = lazy(() => import('./pages/Admin/CryptoPayments'));
const NGNPayments = lazy(() => import('./pages/Admin/NGNPayments'));
const PlatformSettings = lazy(() => import('./pages/Admin/PlatformSettings'));
const AdminPayouts = lazy(() => import('./pages/Admin/Payouts'));
const Ambassadors = lazy(() => import('./pages/Admin/Ambassadors'));
const AmbassadorDashboard = lazy(() => import('./pages/Dashboard/AmbassadorDashboard'));
const AdAssetManagement = lazy(() => import('./pages/Admin/AdAssetManagement'));

// Pages that should have NO navigation chrome
const NO_NAV_PATHS = new Set([
  '/', '/login', '/register', '/verify-email', '/complete-profile',
  '/legal/privacy', '/legal/terms', '/help', '/about',
]);

function AppContent() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { currentUser } = useAuth();

  // Reset scroll position on every route change
  // The scroll container is div.app (height:100dvh, overflow:auto) — not window
  useEffect(() => {
    document.querySelector('.app')?.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname]);

  const path = location.pathname;
  const params = new URLSearchParams(location.search);
  const entered = params.get('entered') === 'true';

  const pathParts = path.split('/').filter(Boolean);
  const isCreatorPath = path.startsWith('/creator/') || (
    pathParts.length === 1 &&
    !NO_NAV_PATHS.has(path) &&
    !['feed', 'dashboard', 'analytics', 'wallet', 'settings', 'search', 'discover', 'explore', 'notifications', 'messages', 'new-post', 'edit-profile', 'become-creator', 'my-calls', 'communities', 'create-community', 'admin', 'payment-success'].includes(pathParts[0])
  );

  const showNav = !NO_NAV_PATHS.has(path)
    && !(isCreatorPath && !currentUser && !entered)
    && !path.startsWith('/video-call/')
    && !path.startsWith('/voice-call/')
    && !path.startsWith('/book-video-call/')
    && !path.startsWith('/waiting-room/')
    && !path.startsWith('/call-summary/')
    && !path.startsWith('/book-voice-call/')
    && !path.startsWith('/livestream/');

  const showDiscoverSidebar = path === '/feed';
  const isMessagesPage = path === '/messages';

  return (
    <div className="app bg-gray-50" style={{ height: '100dvh', overflow: isMessagesPage ? 'hidden' : 'auto' }}>
    {showNav && <MobileNavbar onMenuClick={() => setSidebarOpen(true)} />}
    {showNav && <GlobalSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />}

    <div className={[
      showNav ? (isMessagesPage ? 'pt-14 lg:pt-0' : 'pt-14 pb-20 lg:pt-0 lg:pb-0') : '',
      showNav ? 'lg:ml-64' : '',
      showNav && showDiscoverSidebar ? 'lg:mr-72' : '',
      isMessagesPage ? 'h-[calc(100dvh-56px)] lg:h-screen overflow-hidden' : '',
    ].filter(Boolean).join(' ')}>
        <Suspense fallback={<LoadingSpinner />}>
          <Routes>
            {/* Public */}
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/legal/terms" element={<TermsAndConditions />} />
            <Route path="/legal/privacy" element={<PrivacyPolicy />} />
            <Route path="/help" element={<HelpCenter />} />
            <Route path="/about" element={<AboutUs />} />
            <Route path="/support" element={<Support />} />

            {/* Auth required but no email verification */}
            <Route path="/verify-email" element={<ProtectedRoute requireVerification={false}><VerifyEmail /></ProtectedRoute>} />
            <Route path="/complete-profile" element={<ProtectedRoute requireVerification={false}><CompleteProfile /></ProtectedRoute>} />

            {/* Main app */}
            <Route path="/feed" element={<Feed />} />
            <Route path="/creator/:username" element={<CreatorProfile />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/analytics" element={<ProtectedRoute><CreatorAnalytics /></ProtectedRoute>} />
            <Route path="/wallet" element={<ProtectedRoute><Wallet /></ProtectedRoute>} />
            <Route path="/payment-success" element={<ProtectedRoute><PaymentSuccess /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/discover" element={<Discover />} />
            <Route path="/explore" element={<Discover />} />
            <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
            <Route path="/messages" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
            <Route path="/new-post" element={<ProtectedRoute><NewPost /></ProtectedRoute>} />
            <Route path="/edit-profile" element={<ProtectedRoute><EditProfile /></ProtectedRoute>} />
            <Route path="/become-creator" element={<ProtectedRoute><BecomeCreator /></ProtectedRoute>} />
            <Route path="/my-calls" element={<MyCalls />} />

            {/* Communities */}
            <Route path="/communities" element={<ProtectedRoute><Communities /></ProtectedRoute>} />
            <Route path="/community/:communityId" element={<ProtectedRoute><CommunityDetail /></ProtectedRoute>} />
            <Route path="/community/:communityId/settings" element={<ProtectedRoute><CommunitySettings /></ProtectedRoute>} />
            <Route path="/create-community" element={<ProtectedRoute><CreateCommunity /></ProtectedRoute>} />

            {/* Calls — full screen, no nav */}
            <Route path="/video-call/:bookingId" element={<ProtectedRoute><VideoCallRoom /></ProtectedRoute>} />
            <Route path="/voice-call/:bookingId" element={<ProtectedRoute><VoiceCallRoom /></ProtectedRoute>} />
            <Route path="/book-video-call/:creatorId" element={<ProtectedRoute><BookVideoCall /></ProtectedRoute>} />
            <Route path="/book-voice-call/:creatorId" element={<ProtectedRoute><BookVoiceCall /></ProtectedRoute>} />
            <Route path="/waiting-room/:bookingId" element={<ProtectedRoute><CallWaitingRoom /></ProtectedRoute>} />
            <Route path="/call-summary/:bookingId" element={<ProtectedRoute><CallSummary /></ProtectedRoute>} />
            <Route path="/livestream/:creatorId" element={<ProtectedRoute><LivestreamRoom /></ProtectedRoute>} />

            {/* Admin Routes */}
            <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
            <Route path="/admin/kyc" element={<AdminRoute><KYCManagement /></AdminRoute>} />
            <Route path="/admin/users" element={<AdminRoute><UserManagement /></AdminRoute>} />
            <Route path="/admin/analytics" element={<AdminRoute><AdminAnalytics /></AdminRoute>} />
            <Route path="/admin/payment-logs" element={<AdminRoute><NowPaymentsLogs /></AdminRoute>} />
            <Route path="/admin/crypto-payments" element={<AdminRoute><CryptoPayments /></AdminRoute>} />
            <Route path="/admin/ngn-payments" element={<AdminRoute><NGNPayments /></AdminRoute>} />
            <Route path="/admin/settings" element={<AdminRoute><PlatformSettings /></AdminRoute>} />
            <Route path="/admin/payouts" element={<AdminRoute><AdminPayouts /></AdminRoute>} />
            <Route path="/admin/ambassadors" element={<AdminRoute><Ambassadors /></AdminRoute>} />
            <Route path="/admin/ad-assets" element={<AdminRoute><AdAssetManagement /></AdminRoute>} />
            {/* Ambassador Dashboard */}
            <Route path="/ambassador-dashboard" element={<ProtectedRoute><AmbassadorDashboard /></ProtectedRoute>} />

            {/* Wildcard direct username route */}
            <Route path="/:username" element={<CreatorProfile />} />
          </Routes>
        </Suspense>
      </div>

      {showNav && showDiscoverSidebar && <DiscoverSidebar />}
      {showNav && <MobileBottomNav />}
    </div>
  );
}

function AppMain() {
  const { loading } = useAuth();
  if (loading) return <LoadingScreen />;
  return <AppContent />;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ContentSettingsProvider>
          <DataLiteProvider>
            <AppMain />
          </DataLiteProvider>
        </ContentSettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;