import { useMediaQuery } from './useMediaQuery';

/**
 * Detects if the app is running as a Progressive Web App (PWA) in standalone mode.
 * This is useful for handling PWA-specific behaviors, such as iframe restrictions
 * that may occur when the app is installed as a Chrome App.
 */
export function useIsPwa(): boolean {
  const isStandalone = useMediaQuery('(display-mode: standalone)');

  // Also check navigator.standalone for iOS Safari
  const isIosStandalone =
    typeof window !== 'undefined' &&
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true;

  return isStandalone || isIosStandalone;
}
