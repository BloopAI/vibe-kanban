import type { CreateModeInitialState } from '@/shared/types/createMode';

// Synchronous bridge: actions set state here before navigation,
// WorkspacesLayout consumes it on mount. Bypasses async scratch WebSocket
// so Priority 1 in initializeState always gets the data.

let pendingSeedState: CreateModeInitialState | null = null;

export function setCreateModeSeedState(
  state: CreateModeInitialState | null
): void {
  console.log('[SeedStore] SET:', JSON.stringify(state, null, 2));
  pendingSeedState = state;
}

export function consumeCreateModeSeedState(): CreateModeInitialState | null {
  const state = pendingSeedState;
  pendingSeedState = null;
  console.log('[SeedStore] CONSUME:', state ? JSON.stringify({ hasPrompt: !!state.initialPrompt, hasLinkedIssue: !!state.linkedIssue, repoCount: state.preferredRepos?.length ?? 0, hasExecutorConfig: !!state.executorConfig }) : 'null');
  return state;
}
