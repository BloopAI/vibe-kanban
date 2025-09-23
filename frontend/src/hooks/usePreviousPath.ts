import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const STORAGE_KEY = 'lastNonSettingsPath';

export function usePreviousPath() {
  const location = useLocation();

  useEffect(() => {
    if (!location.pathname.startsWith('/settings')) {
      sessionStorage.setItem(STORAGE_KEY, location.pathname);
    }
  }, [location.pathname]);

  const getPreviousPath = (): string => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    return stored && stored !== '/settings' && !stored.startsWith('/settings/')
      ? stored
      : '/projects';
  };

  return getPreviousPath;
}
