import { useCallback, useEffect, useState } from 'react';
import type { ScratchType, Scratch, UpdateScratch } from 'shared/types';
import type { UseScratchResult } from './useScratch';

const STORAGE_PREFIX = 'vk-scratch';

function buildStorageKey(scratchType: ScratchType, id: string): string {
  return `${STORAGE_PREFIX}:${scratchType}:${id}`;
}

function readFromStorage(key: string): Scratch | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as Scratch;
  } catch {
    return null;
  }
}

function writeToStorage(key: string, scratch: Scratch): void {
  try {
    localStorage.setItem(key, JSON.stringify(scratch));
  } catch {
    // Quota exceeded or unavailable — silently drop the write
  }
}

function removeFromStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore errors
  }
}

function buildScratchEntry(
  id: string,
  update: UpdateScratch,
  existing: Scratch | null
): Scratch {
  const now = new Date().toISOString();
  return {
    id: existing?.id ?? id,
    payload: update.payload,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
}

export function localStorageScratchUpdate(
  scratchType: ScratchType,
  id: string,
  update: UpdateScratch
): void {
  const key = buildStorageKey(scratchType, id);
  const next = buildScratchEntry(id, update, readFromStorage(key));
  writeToStorage(key, next);
}

interface UseLocalStorageScratchOptions {
  enabled?: boolean;
}

/**
 * localStorage-backed scratch storage for remote-web.
 * Mirrors the same interface as the WebSocket-based `useScratch` hook
 * so consumers can swap between them transparently.
 */
export const useLocalStorageScratch = (
  scratchType: ScratchType,
  id: string,
  options?: UseLocalStorageScratchOptions
): UseScratchResult => {
  const enabled = (options?.enabled ?? true) && id.length > 0;
  const storageKey = buildStorageKey(scratchType, id);

  const [scratch, setScratch] = useState<Scratch | null>(() =>
    enabled ? readFromStorage(storageKey) : null
  );
  // Start as `enabled` — when enabled, the useState initializer above already
  // synchronously reads from localStorage, so data is available on the first
  // render and there is no need for an extra "loading" cycle.
  const [isInitialized, setIsInitialized] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setScratch(null);
      setIsInitialized(false);
      return;
    }

    const stored = readFromStorage(storageKey);
    setScratch(stored);
    setIsInitialized(true);
  }, [storageKey, enabled]);

  useEffect(() => {
    if (!enabled) return;

    function onStorage(e: StorageEvent) {
      if (e.key !== storageKey) return;
      if (e.newValue === null) {
        setScratch(null);
      } else {
        try {
          setScratch(JSON.parse(e.newValue) as Scratch);
        } catch {
          // corrupt value — ignore
        }
      }
    }

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [storageKey, enabled]);

  const updateScratch = useCallback(
    async (update: UpdateScratch) => {
      const next = buildScratchEntry(id, update, readFromStorage(storageKey));
      writeToStorage(storageKey, next);
      setScratch(next);
    },
    [storageKey, id]
  );

  const deleteScratch = useCallback(async () => {
    removeFromStorage(storageKey);
    setScratch(null);
  }, [storageKey]);

  return {
    scratch,
    isLoading: !isInitialized && enabled,
    isConnected: true,
    error: null,
    updateScratch,
    deleteScratch,
  };
};
