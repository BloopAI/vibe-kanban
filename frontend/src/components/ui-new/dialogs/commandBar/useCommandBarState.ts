import { useReducer, useCallback, useRef } from 'react';
import type {
  PageId,
  ResolvedGroupItem,
} from '@/components/ui-new/actions/pages';
import {
  type ActionDefinition,
  type GitActionDefinition,
  ActionTargetType,
} from '@/components/ui-new/actions';

export type CommandBarState =
  | { status: 'browsing'; page: PageId; stack: PageId[]; search: string }
  | {
      status: 'selectingRepo';
      stack: PageId[];
      search: string;
      pendingAction: GitActionDefinition;
    }
  | {
      status: 'selectingStatus';
      stack: PageId[];
      search: string;
      pendingProjectId: string;
      pendingIssueIds: string[];
    }
  | {
      status: 'selectingPriority';
      stack: PageId[];
      search: string;
      pendingProjectId: string;
      pendingIssueIds: string[];
    }
  | {
      status: 'selectingSubIssue';
      stack: PageId[];
      search: string;
      pendingProjectId: string;
      pendingParentIssueId: string;
    };

export type CommandBarEvent =
  | { type: 'RESET'; page: PageId }
  | { type: 'SEARCH_CHANGE'; query: string }
  | { type: 'GO_BACK' }
  | { type: 'SELECT_ITEM'; item: ResolvedGroupItem }
  | { type: 'START_STATUS_SELECTION'; projectId: string; issueIds: string[] }
  | { type: 'START_PRIORITY_SELECTION'; projectId: string; issueIds: string[] }
  | {
      type: 'START_SUB_ISSUE_SELECTION';
      projectId: string;
      parentIssueId: string;
    };

export type CommandBarEffect =
  | { type: 'none' }
  | { type: 'execute'; action: ActionDefinition; repoId?: string }
  | {
      type: 'updateStatus';
      projectId: string;
      issueIds: string[];
      statusId: string;
    }
  | {
      type: 'updatePriority';
      projectId: string;
      issueIds: string[];
      priority: 'urgent' | 'high' | 'medium' | 'low' | null;
    }
  | {
      type: 'addSubIssue';
      projectId: string;
      parentIssueId: string;
      childIssueId: string;
    }
  | {
      type: 'createSubIssue';
      projectId: string;
      parentIssueId: string;
    };

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

const selectingStatus = (
  pendingProjectId: string,
  pendingIssueIds: string[],
  stack: PageId[] = []
): CommandBarState => ({
  status: 'selectingStatus',
  stack,
  search: '',
  pendingProjectId,
  pendingIssueIds,
});

const selectingPriority = (
  pendingProjectId: string,
  pendingIssueIds: string[],
  stack: PageId[] = []
): CommandBarState => ({
  status: 'selectingPriority',
  stack,
  search: '',
  pendingProjectId,
  pendingIssueIds,
});

const selectingSubIssue = (
  pendingProjectId: string,
  pendingParentIssueId: string,
  stack: PageId[] = []
): CommandBarState => ({
  status: 'selectingSubIssue',
  stack,
  search: '',
  pendingProjectId,
  pendingParentIssueId,
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

  if (event.type === 'START_STATUS_SELECTION') {
    return [
      selectingStatus(event.projectId, event.issueIds, state.stack),
      noEffect,
    ];
  }

  if (event.type === 'START_PRIORITY_SELECTION') {
    return [
      selectingPriority(event.projectId, event.issueIds, state.stack),
      noEffect,
    ];
  }

  if (event.type === 'START_SUB_ISSUE_SELECTION') {
    return [
      selectingSubIssue(event.projectId, event.parentIssueId, state.stack),
      noEffect,
    ];
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

    if (state.status === 'selectingStatus' && event.item.type === 'status') {
      return [
        browsing('root'),
        {
          type: 'updateStatus',
          projectId: state.pendingProjectId,
          issueIds: state.pendingIssueIds,
          statusId: event.item.status.id,
        },
      ];
    }

    if (
      state.status === 'selectingPriority' &&
      event.item.type === 'priority'
    ) {
      return [
        browsing('root'),
        {
          type: 'updatePriority',
          projectId: state.pendingProjectId,
          issueIds: state.pendingIssueIds,
          priority: event.item.priority.id,
        },
      ];
    }

    if (state.status === 'selectingSubIssue' && event.item.type === 'issue') {
      return [
        browsing('root'),
        {
          type: 'addSubIssue',
          projectId: state.pendingProjectId,
          parentIssueId: state.pendingParentIssueId,
          childIssueId: event.item.issue.id,
        },
      ];
    }

    if (
      state.status === 'selectingSubIssue' &&
      event.item.type === 'createSubIssue'
    ) {
      return [
        browsing('root'),
        {
          type: 'createSubIssue',
          projectId: state.pendingProjectId,
          parentIssueId: state.pendingParentIssueId,
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
        if (item.action.requiresTarget === ActionTargetType.GIT) {
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

  const currentPage: PageId =
    state.status === 'selectingRepo'
      ? 'selectRepo'
      : state.status === 'selectingStatus'
        ? 'selectStatus'
        : state.status === 'selectingPriority'
          ? 'selectPriority'
          : state.status === 'selectingSubIssue'
            ? 'selectSubIssue'
            : state.page;

  return {
    state,
    currentPage,
    canGoBack: state.stack.length > 0,
    dispatch,
  };
}
