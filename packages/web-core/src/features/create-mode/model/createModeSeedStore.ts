import type { CreateModeInitialState } from '@/shared/types/createMode';

// Synchronous bridge: actions set state here before navigation,
// WorkspacesLayout consumes it on mount. Bypasses async scratch WebSocket
// so Priority 1 in initializeState always gets the data.

let pendingSeedState: CreateModeInitialState | null = null;
let seedVersion = 0;
const listeners = new Set<() => void>();

function notifySeedListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function setCreateModeSeedState(
  state: CreateModeInitialState | null
): void {
  pendingSeedState = state;
  seedVersion += 1;
  notifySeedListeners();
}

export function consumeCreateModeSeedState(): CreateModeInitialState | null {
  const state = pendingSeedState;
  pendingSeedState = null;
  return state;
}

export function subscribeCreateModeSeedState(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function getCreateModeSeedVersion(): number {
  return seedVersion;
}
