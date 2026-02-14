import { useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const globalVisited: string[] = [];
const skipReturnToPaths = new Set([
  // Legacy alias routes that immediately redirect back into settings.
  // Returning to them makes the "close settings" button appear broken.
  '/mcp-servers',
]);

function normalizePath(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.replace(/\/+$/, '');
  }
  return pathname;
}

export function usePreviousPath() {
  const navigate = useNavigate();
  const location = useLocation();

  // Track pathnames as user navigates
  useEffect(() => {
    const pathname = normalizePath(location.pathname);
    if (globalVisited[globalVisited.length - 1] !== pathname) {
      globalVisited.push(pathname);
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
      .find(
        (p) => !p.startsWith('/settings') && !skipReturnToPaths.has(p)
      );
    navigate(lastNonSettingsPath || '/');
  }, [navigate]);
}
