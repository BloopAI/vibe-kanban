import { useEffect } from 'react';
import { isTauriApp } from '@/shared/lib/platform';
import { router } from '@web/app/router';

/**
 * Listens for `notification-clicked` events emitted by the macOS native
 * notification delegate when the user clicks an OS notification.
 * Navigates to the `deeplinkPath` carried in the event payload.
 */
export function useTauriNotificationNavigation() {
  useEffect(() => {
    if (!isTauriApp()) return;

    let unlisten: (() => void) | undefined;

    async function setup() {
      const { listen } = await import('@tauri-apps/api/event');

      unlisten = await listen<{ deeplinkPath: string }>(
        'notification-clicked',
        (event) => {
          const path = event.payload.deeplinkPath;
          if (path) {
            router.navigate({ to: path as '/' });
          }
        }
      );
    }

    setup();
    return () => {
      unlisten?.();
    };
  }, []);
}
