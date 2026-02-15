import { PatchType } from 'shared/types';

const MAX_CACHED_PROCESSES = 100;

// Module-level cache that persists across component mount/unmount
const cache = new Map<string, PatchType[]>();

export function getCachedEntries(
  executionProcessId: string
): PatchType[] | undefined {
  return cache.get(executionProcessId);
}

export function setCachedEntries(
  executionProcessId: string,
  entries: PatchType[]
): void {
  // FIFO eviction when at capacity
  if (cache.size >= MAX_CACHED_PROCESSES && !cache.has(executionProcessId)) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }
  cache.set(executionProcessId, entries);
}
