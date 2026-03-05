import { useEffect, useRef } from 'react';
import { useAppNavigation } from '@/shared/hooks/useAppNavigation';
import { isTauriApp } from '@/shared/lib/platform';

/**
 * Listens for `navigate-to-workspace` events emitted by the Tauri backend
 * when a notification fires. Navigates to the workspace view:
 * - Immediately if the window is not focused (background/hidden)
 * - On next focus if the window is currently focused (avoids disrupting the user)
 * Multiple consecutive notifications: last one wins.
 */
export function useTauriNotificationNavigation() {
  const navigation = useAppNavigation();
  const pendingWorkspaceId = useRef<string | null>(null);

  useEffect(() => {
    if (!isTauriApp()) return;

    let unlisten: (() => void) | undefined;

    async function setup() {
      const { listen } = await import('@tauri-apps/api/event');

      unlisten = await listen<{ workspaceId: string }>(
        'navigate-to-workspace',
        (event) => {
          const { workspaceId } = event.payload;
          if (!document.hasFocus()) {
            navigation.goToWorkspace(workspaceId);
            pendingWorkspaceId.current = null;
          } else {
            pendingWorkspaceId.current = workspaceId;
          }
        }
      );
    }

    function onFocus() {
      const id = pendingWorkspaceId.current;
      if (id) {
        pendingWorkspaceId.current = null;
        navigation.goToWorkspace(id);
      }
    }

    setup();
    window.addEventListener('focus', onFocus);

    return () => {
      unlisten?.();
      window.removeEventListener('focus', onFocus);
    };
  }, [navigation]);
}
