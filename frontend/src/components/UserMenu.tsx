import { useState, useRef, useEffect } from 'react';
import { useLocalAuth } from '@/contexts/LocalAuthContext';

export function UserMenu() {
  const { user, isAuthenticated, isLocalAuthConfigured, login, logout } = useLocalAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // If local auth is not configured, don't show anything
  if (!isLocalAuthConfigured) {
    return null;
  }

  // If not authenticated, show sign in button
  if (!isAuthenticated) {
    return (
      <button
        onClick={() => login()}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
      >
        <svg
          className="h-4 w-4"
          fill="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
            clipRule="evenodd"
          />
        </svg>
        Sign in
      </button>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1 rounded-md hover:bg-muted transition-colors"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {user?.avatar_url ? (
          <img
            src={user.avatar_url}
            alt={user.display_name || user.username}
            className="h-7 w-7 rounded-full"
          />
        ) : (
          <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center text-xs font-medium text-primary-foreground">
            {(user?.display_name || user?.username || '?').charAt(0).toUpperCase()}
          </div>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-popover border border-border rounded-md shadow-lg z-50">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-medium text-foreground truncate">
              {user?.display_name || user?.username}
            </p>
            {user?.email && (
              <p className="text-xs text-muted-foreground truncate">
                {user.email}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              @{user?.username}
            </p>
          </div>

          <div className="py-1">
            <button
              onClick={() => {
                setIsOpen(false);
                logout();
              }}
              className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
