import { useLocation } from 'react-router-dom';

/**
 * Custom hook to detect if the current route is in fullscreen mode
 * Provides a consistent way to check for fullscreen state across the app
 * @returns boolean indicating if current route ends with '/full'
 */
export function useFullscreenState(): boolean {
  const location = useLocation();
  return location.pathname.endsWith('/full');
}
