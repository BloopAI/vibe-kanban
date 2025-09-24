import { useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const globalVisited: string[] = [];

export function usePreviousPath() {
  const navigate = useNavigate();
  const location = useLocation();

  // Track pathnames as user navigates
  useEffect(() => {
    if (globalVisited[globalVisited.length - 1] !== location.pathname) {
      globalVisited.push(location.pathname);
      // Keep only last 50 entries to prevent memory bloat
      if (globalVisited.length > 50) {
        globalVisited.splice(0, globalVisited.length - 50);
      }
    }
  }, [location]);

  return useCallback(() => {
    // Find last non-settings route in history
    const lastNonSettingsPath = [...globalVisited]
      .reverse()
      .find((p) => !p.startsWith('/settings'));
    navigate(lastNonSettingsPath || '/');
  }, [navigate]);
}
