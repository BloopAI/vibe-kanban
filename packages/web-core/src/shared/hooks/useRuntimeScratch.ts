import type { ScratchType } from 'shared/types';
import { useAppRuntime } from './useAppRuntime';
import { useScratch, type UseScratchResult } from './useScratch';
import { useLocalStorageScratch } from './useLocalStorageScratch';

interface UseRuntimeScratchOptions {
  enabled?: boolean;
}

/**
 * Runtime-aware scratch storage.
 * Local runtime → server-side WebSocket/API (useScratch).
 * Remote runtime → localStorage (useLocalStorageScratch).
 */
export const useRuntimeScratch = (
  scratchType: ScratchType,
  id: string,
  options?: UseRuntimeScratchOptions
): UseScratchResult => {
  const runtime = useAppRuntime();
  const isRemote = runtime === 'remote';

  const serverResult = useScratch(scratchType, id, {
    enabled: !isRemote && (options?.enabled ?? true),
  });

  const localResult = useLocalStorageScratch(scratchType, id, {
    enabled: isRemote && (options?.enabled ?? true),
  });

  return isRemote ? localResult : serverResult;
};
