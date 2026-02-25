import { useSyncExternalStore } from 'react';

export const MOBILE_MAX_WIDTH = 767;
const MEDIA_QUERY = `(max-width: ${MOBILE_MAX_WIDTH}px)`;

/**
 * Non-hook check for mobile breakpoint. Safe to call outside React components
 * and in non-DOM environments (returns false when window is unavailable).
 */
export function isMobileQuery(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia(MEDIA_QUERY).matches
  );
}

function subscribe(callback: () => void): () => void {
  const mql = window.matchMedia(MEDIA_QUERY);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function getSnapshot(): boolean {
  return window.matchMedia(MEDIA_QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
