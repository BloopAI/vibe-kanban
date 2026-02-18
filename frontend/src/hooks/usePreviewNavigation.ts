import { useCallback, useState } from 'react';
import type {
  NavigationState,
  PreviewDevToolsMessage,
} from '../types/previewDevTools';

export interface UsePreviewNavigationReturn {
  navigation: NavigationState | null;
  isReady: boolean;
  handleMessage: (message: PreviewDevToolsMessage) => void;
  reset: () => void;
}

export function usePreviewNavigation(): UsePreviewNavigationReturn {
  const [navigation, setNavigation] = useState<NavigationState | null>(null);
  const [isReady, setIsReady] = useState(false);

  const handleMessage = useCallback((message: PreviewDevToolsMessage) => {
    switch (message.type) {
      case 'navigation':
        setNavigation({
          url: message.payload.url,
          title: message.payload.title,
          canGoBack: message.payload.canGoBack,
          canGoForward: message.payload.canGoForward,
        });
        break;
      case 'ready':
        setIsReady(true);
        break;
      default:
        break;
    }
  }, []);

  const reset = useCallback(() => {
    setNavigation(null);
    setIsReady(false);
  }, []);

  return { navigation, isReady, handleMessage, reset };
}
