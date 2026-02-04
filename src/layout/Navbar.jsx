import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

const pathTitleMap = {
  '/': 'Landing',
  '/login': 'Login',
  '/register': 'Register',
  '/feed': 'Feed',
  '/creator': 'Creator',
  '/dashboard': 'Dashboard',
  '/wallet': 'Wallet',
  '/admin': 'Admin',
  '/settings': 'Settings',
  '/search': 'Search',
  '/discover': 'Discover',
  '/notifications': 'Notifications',
  '/messages': 'Messages',
  '/new-post': 'Create New Post'
};

const Navbar = ({ isDark, toggleTheme }) => {
  const location = useLocation();

  const title = useMemo(() => {
    // If on a creator page, show the username nicely
    if (location.pathname.startsWith('/creator/')) {
      const parts = location.pathname.split('/').filter(Boolean);
      const username = parts[1] || '';
      const clean = username.replace('@', '');
      return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : 'Creator';
    }

    const path = location.pathname.split('/').slice(0,2).join('/') || '/';
    // exact match first
    if (pathTitleMap[location.pathname]) return pathTitleMap[location.pathname];
    if (pathTitleMap[path]) return pathTitleMap[path];
    // fallback: use last segment
    const seg = location.pathname.split('/').filter(Boolean).pop();
    return seg ? seg.charAt(0).toUpperCase() + seg.slice(1) : 'unlukt';
  }, [location.pathname]);

  return (
    <nav className="sticky top-0 z-40 bg-white border-b">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center">
        <h1 className="text-lg font-semibold">{title}</h1>
        <div className="ml-auto">
          <button
            onClick={toggleTheme}
            className="px-3 py-1 border rounded text-sm"
            aria-pressed={isDark}
          >
            {isDark ? 'Dark' : 'Light'}
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
