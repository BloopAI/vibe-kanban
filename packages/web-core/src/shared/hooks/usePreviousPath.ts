import { useCallback, useEffect } from 'react';
import { useLocation } from '@tanstack/react-router';
import { useAppNavigation } from '@/shared/hooks/useAppNavigation';

const globalVisited: string[] = [];

export function usePreviousPath() {
  const location = useLocation();
  const appNavigation = useAppNavigation();

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

    if (!lastNonSettingsPath) {
      appNavigation.navigate(appNavigation.toRoot());
      return;
    }

    appNavigation.navigate(
      appNavigation.resolveFromPath(lastNonSettingsPath) ??
        appNavigation.toRoot()
    );
  }, [appNavigation]);
}
