import { useEffect } from 'react';
import { isTauriApp } from '@/shared/lib/platform';
import { useAppUpdateStore } from '@/shared/stores/useAppUpdateStore';

/**
 * Listens for the `update-installed` event emitted by the Tauri backend
 * after an update has been silently downloaded and applied. Sets the
 * shared update store so the AppBar can show a restart button.
 */
export function useTauriUpdateReady() {
  const setUpdate = useAppUpdateStore((s) => s.setUpdate);

  useEffect(() => {
    if (!isTauriApp()) return;

    let unlisten: (() => void) | undefined;

    async function setup() {
      const { listen, emit } = await import('@tauri-apps/api/event');

      unlisten = await listen<{ newVersion: string }>(
        'update-installed',
        (event) => {
          setUpdate(event.payload.newVersion, () => {
            emit('restart-app');
          });
        }
      );
    }

    setup();
    return () => {
      unlisten?.();
    };
  }, [setUpdate]);
}
