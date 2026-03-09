import type { CreateModeInitialState } from '@/shared/types/createMode';

// Synchronous bridge: actions set state here before navigation,
// WorkspacesLayout consumes it on mount. Bypasses async scratch WebSocket
// so Priority 1 in initializeState always gets the data.

let pendingSeedState: CreateModeInitialState | null = null;

export function setCreateModeSeedState(
  state: CreateModeInitialState | null
): void {
  pendingSeedState = state;
}

export function consumeCreateModeSeedState(): CreateModeInitialState | null {
  const state = pendingSeedState;
  pendingSeedState = null;
  return state;
}
