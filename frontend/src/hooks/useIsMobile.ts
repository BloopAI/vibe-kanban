import { useSyncExternalStore } from 'react';

const query = '(max-width: 767px)';
let mediaQuery: MediaQueryList | null = null;

function getMediaQuery() {
  if (!mediaQuery) {
    mediaQuery = window.matchMedia(query);
  }
  return mediaQuery;
}

function subscribe(callback: () => void) {
  const mq = getMediaQuery();
  mq.addEventListener('change', callback);
  return () => mq.removeEventListener('change', callback);
}

function getSnapshot() {
  return getMediaQuery().matches;
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}
