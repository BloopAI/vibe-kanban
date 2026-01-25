import { useReducer, useCallback, useRef } from 'react';
import type {
  PageId,
  ResolvedGroupItem,
} from '@/components/ui-new/actions/pages';
import type {
  ActionDefinition,
  GitActionDefinition,
} from '@/components/ui-new/actions';

export type CommandBarState =
  | { status: 'browsing'; page: PageId; stack: PageId[]; search: string }
  | {
      status: 'selectingRepo';
      stack: PageId[];
      search: string;
      pendingAction: GitActionDefinition;
    };

export type CommandBarEvent =
  | { type: 'RESET'; page: PageId }
  | { type: 'SEARCH_CHANGE'; query: string }
  | { type: 'GO_BACK' }
  | { type: 'SELECT_ITEM'; item: ResolvedGroupItem };

export type CommandBarEffect =
  | { type: 'none' }
  | { type: 'execute'; action: ActionDefinition; repoId?: string };

const browsing = (page: PageId, stack: PageId[] = []): CommandBarState => ({
  status: 'browsing',
  page,
  stack,
  search: '',
});

const selectingRepo = (
  pendingAction: GitActionDefinition,
  stack: PageId[] = []
): CommandBarState => ({
  status: 'selectingRepo',
  stack,
  search: '',
  pendingAction,
});

const noEffect: CommandBarEffect = { type: 'none' };

function reducer(
  state: CommandBarState,
  event: CommandBarEvent,
  repoCount: number,
  initialPendingAction?: GitActionDefinition
): [CommandBarState, CommandBarEffect] {
  if (event.type === 'RESET') {
    // If initialPendingAction is provided and there are multiple repos,
    // start directly in repo selection mode
    if (initialPendingAction && repoCount > 1) {
      return [selectingRepo(initialPendingAction), noEffect];
    }
    return [browsing(event.page), noEffect];
  }
  if (event.type === 'SEARCH_CHANGE') {
    return [{ ...state, search: event.query }, noEffect];
  }
  if (event.type === 'GO_BACK') {
    const prevPage = state.stack[state.stack.length - 1];
    if (state.status === 'browsing' && !prevPage) return [state, noEffect];
    return [browsing(prevPage ?? 'root', state.stack.slice(0, -1)), noEffect];
  }

  if (event.type === 'SELECT_ITEM') {
    if (state.status === 'selectingRepo' && event.item.type === 'repo') {
      return [
        browsing('root'),
        {
          type: 'execute',
          action: state.pendingAction,
          repoId: event.item.repo.id,
        },
      ];
    }

    if (state.status === 'browsing') {
      const { item } = event;
      if (item.type === 'page') {
        return [
          {
            ...state,
            page: item.pageId,
            stack: [...state.stack, state.page],
            search: '',
          },
          noEffect,
        ];
      }
      if (item.type === 'action') {
        if (item.action.requiresTarget === 'git') {
          if (repoCount === 1) {
            return [
              state,
              { type: 'execute', action: item.action, repoId: '__single__' },
            ];
          }
          if (repoCount > 1) {
            return [
              {
                status: 'selectingRepo',
                stack: [...state.stack, state.page],
                search: '',
                pendingAction: item.action as GitActionDefinition,
              },
              noEffect,
            ];
          }
        }
        return [state, { type: 'execute', action: item.action }];
      }
    }
  }

  return [state, noEffect];
}

export function useCommandBarState(
  initialPage: PageId,
  repoCount: number,
  initialPendingAction?: GitActionDefinition
) {
  // Use refs to avoid stale closures and keep dispatch stable
  const initialPendingActionRef = useRef(initialPendingAction);
  initialPendingActionRef.current = initialPendingAction;

  // Compute initial state based on whether we have a pending git action
  const computeInitialState = (): CommandBarState => {
    if (initialPendingAction && repoCount > 1) {
      return selectingRepo(initialPendingAction);
    }
    return browsing(initialPage);
  };

  const stateRef = useRef<CommandBarState>(computeInitialState());
  const repoCountRef = useRef(repoCount);
  repoCountRef.current = repoCount;

  const [state, rawDispatch] = useReducer(
    (s: CommandBarState, e: CommandBarEvent) => {
      const [newState] = reducer(
        s,
        e,
        repoCountRef.current,
        initialPendingActionRef.current
      );
      stateRef.current = newState;
      return newState;
    },
    undefined,
    computeInitialState
  );

  // Keep stateRef in sync
  stateRef.current = state;

  // Stable dispatch that doesn't change on every render
  const dispatch = useCallback(
    (event: CommandBarEvent): CommandBarEffect => {
      const [, effect] = reducer(
        stateRef.current,
        event,
        repoCountRef.current,
        initialPendingActionRef.current
      );
      rawDispatch(event);
      return effect;
    },
    [] // No dependencies - uses refs for current values
  );

  return {
    state,
    currentPage: (state.status === 'selectingRepo'
      ? 'selectRepo'
      : state.page) as PageId,
    canGoBack: state.stack.length > 0,
    dispatch,
  };
}
