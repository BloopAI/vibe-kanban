import { useReducer, useCallback } from 'react';
import type { PageId, ResolvedGroupItem } from '@/components/ui-new/actions/pages';
import type {
  ActionDefinition,
  GitActionDefinition,
} from '@/components/ui-new/actions';

// ============================================================================
// Types
// ============================================================================

/** Discriminated union for command bar state */
export type CommandBarState =
  | { status: 'browsing'; page: PageId; stack: PageId[]; search: string }
  | {
      status: 'selectingRepo';
      stack: PageId[];
      search: string;
      pendingAction: GitActionDefinition;
    };

/** Events the state machine can handle */
export type CommandBarEvent =
  | { type: 'RESET'; page: PageId }
  | { type: 'SEARCH_CHANGE'; query: string }
  | { type: 'GO_BACK' }
  | { type: 'SELECT_ITEM'; item: ResolvedGroupItem };

/** Side effects returned from state transitions */
export type CommandBarEffect =
  | { type: 'none' }
  | { type: 'execute'; action: ActionDefinition; repoId?: string };

// ============================================================================
// Reducer
// ============================================================================

function reducer(
  state: CommandBarState,
  event: CommandBarEvent,
  repoCount: number
): [CommandBarState, CommandBarEffect] {
  switch (state.status) {
    case 'browsing': {
      switch (event.type) {
        case 'RESET':
          return [
            { status: 'browsing', page: event.page, stack: [], search: '' },
            { type: 'none' },
          ];

        case 'SEARCH_CHANGE':
          return [{ ...state, search: event.query }, { type: 'none' }];

        case 'GO_BACK': {
          if (state.stack.length === 0) return [state, { type: 'none' }];
          const prevPage = state.stack[state.stack.length - 1];
          return [
            { ...state, page: prevPage, stack: state.stack.slice(0, -1), search: '' },
            { type: 'none' },
          ];
        }

        case 'SELECT_ITEM': {
          const { item } = event;

          if (item.type === 'page') {
            return [
              { ...state, page: item.pageId, stack: [...state.stack, state.page], search: '' },
              { type: 'none' },
            ];
          }

          if (item.type === 'action') {
            if (item.action.requiresTarget === 'git') {
              if (repoCount === 1) {
                // Single repo - effect will provide repoId from context
                return [state, { type: 'execute', action: item.action, repoId: '__single__' }];
              }
              if (repoCount > 1) {
                return [
                  {
                    status: 'selectingRepo',
                    stack: [...state.stack, state.page],
                    search: '',
                    pendingAction: item.action as GitActionDefinition,
                  },
                  { type: 'none' },
                ];
              }
            }
            return [state, { type: 'execute', action: item.action }];
          }

          return [state, { type: 'none' }];
        }
      }
      break;
    }

    case 'selectingRepo': {
      switch (event.type) {
        case 'RESET':
          return [
            { status: 'browsing', page: event.page, stack: [], search: '' },
            { type: 'none' },
          ];

        case 'SEARCH_CHANGE':
          return [{ ...state, search: event.query }, { type: 'none' }];

        case 'GO_BACK': {
          const prevPage = state.stack[state.stack.length - 1] ?? 'root';
          return [
            { status: 'browsing', page: prevPage, stack: state.stack.slice(0, -1), search: '' },
            { type: 'none' },
          ];
        }

        case 'SELECT_ITEM': {
          if (event.item.type === 'repo') {
            return [
              { status: 'browsing', page: 'root', stack: [], search: '' },
              { type: 'execute', action: state.pendingAction, repoId: event.item.repo.id },
            ];
          }
          return [state, { type: 'none' }];
        }
      }
      break;
    }
  }

  return [state, { type: 'none' }];
}

// ============================================================================
// Hook
// ============================================================================

export interface UseCommandBarStateReturn {
  state: CommandBarState;
  currentPage: PageId;
  canGoBack: boolean;
  dispatch: (event: CommandBarEvent) => CommandBarEffect;
}

/**
 * State machine hook for command bar navigation.
 * Returns state and a dispatch function that also returns the effect.
 */
export function useCommandBarState(
  initialPage: PageId,
  repoCount: number
): UseCommandBarStateReturn {
  const [state, rawDispatch] = useReducer(
    (s: CommandBarState, e: CommandBarEvent) => reducer(s, e, repoCount)[0],
    { status: 'browsing', page: initialPage, stack: [], search: '' } as CommandBarState
  );

  // Dispatch that also returns the effect
  const dispatch = useCallback(
    (event: CommandBarEvent): CommandBarEffect => {
      const [, effect] = reducer(state, event, repoCount);
      rawDispatch(event);
      return effect;
    },
    [state, repoCount]
  );

  const currentPage: PageId =
    state.status === 'selectingRepo' ? 'selectRepo' : state.page;

  const canGoBack = state.stack.length > 0;

  return { state, currentPage, canGoBack, dispatch };
}
