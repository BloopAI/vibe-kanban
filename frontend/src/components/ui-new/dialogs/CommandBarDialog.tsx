import { useRef, useEffect, useCallback, useMemo, useReducer } from 'react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  StackIcon,
  SlidersIcon,
  SquaresFourIcon,
  GitBranchIcon,
} from '@phosphor-icons/react';
import type { Workspace } from 'shared/types';
import { defineModal } from '@/lib/modals';
import { CommandDialog } from '@/components/ui-new/primitives/Command';
import { CommandBar } from '@/components/ui-new/primitives/CommandBar';
import { useActions } from '@/contexts/ActionsContext';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { attemptKeys } from '@/hooks/useAttempt';
import {
  type ActionDefinition,
  type GitActionDefinition,
} from '@/components/ui-new/actions';
import {
  Pages,
  getPageActions,
  type PageId,
  type StaticPageId,
  type CommandBarGroup,
  type CommandBarGroupItem,
  type ResolvedGroup,
  type ResolvedGroupItem,
} from '@/components/ui-new/actions/pages';
import { resolveLabel } from '@/components/ui-new/actions';
import {
  useActionVisibilityContext,
  isActionVisible,
  isPageVisible,
} from '@/components/ui-new/actions/useActionVisibility';

// ============================================================================
// State Machine Types
// ============================================================================

/** Discriminated union for command bar state */
type CommandBarState =
  | { status: 'browsing'; page: PageId; stack: PageId[]; search: string }
  | {
      status: 'selectingRepo';
      stack: PageId[];
      search: string;
      pendingAction: GitActionDefinition;
    };

/** All possible events the state machine can handle */
type CommandBarEvent =
  | { type: 'RESET'; page: PageId }
  | { type: 'SEARCH_CHANGE'; query: string }
  | { type: 'GO_BACK' }
  | { type: 'SELECT_ITEM'; item: ResolvedGroupItem };

/** Side effects returned from the reducer */
type CommandBarEffect =
  | { type: 'none' }
  | { type: 'execute'; action: ActionDefinition; repoId?: string };

/** Context needed for state transitions */
interface ReducerContext {
  repos: Array<{ id: string }>;
}

// ============================================================================
// State Machine Reducer
// ============================================================================

function commandBarReducer(
  state: CommandBarState,
  event: CommandBarEvent,
  context: ReducerContext
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
            {
              ...state,
              page: prevPage,
              stack: state.stack.slice(0, -1),
              search: '',
            },
            { type: 'none' },
          ];
        }

        case 'SELECT_ITEM': {
          const { item } = event;

          // Navigate to page
          if (item.type === 'page') {
            return [
              {
                ...state,
                page: item.pageId,
                stack: [...state.stack, state.page],
                search: '',
              },
              { type: 'none' },
            ];
          }

          // Execute action
          if (item.type === 'action') {
            // Git actions need repo selection
            if (item.action.requiresTarget === 'git') {
              if (context.repos.length === 1) {
                // Single repo - execute immediately
                return [
                  state,
                  {
                    type: 'execute',
                    action: item.action,
                    repoId: context.repos[0].id,
                  },
                ];
              }
              if (context.repos.length > 1) {
                // Multiple repos - transition to repo selection
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
            // Non-git action - execute directly
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
            {
              status: 'browsing',
              page: prevPage,
              stack: state.stack.slice(0, -1),
              search: '',
            },
            { type: 'none' },
          ];
        }

        case 'SELECT_ITEM': {
          if (event.item.type === 'repo') {
            return [
              { status: 'browsing', page: 'root', stack: [], search: '' },
              {
                type: 'execute',
                action: state.pendingAction,
                repoId: event.item.repo.id,
              },
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

// Resolved page structure passed to CommandBar
interface ResolvedCommandBarPage {
  id: string;
  title?: string;
  groups: ResolvedGroup[];
}

export interface CommandBarDialogProps {
  // Page to show (defaults to 'root')
  page?: PageId;
  // Optional workspaceId for workspace actions
  workspaceId?: string;
}

const CommandBarDialogImpl = NiceModal.create<CommandBarDialogProps>(
  ({ page = 'root', workspaceId }) => {
    const modal = useModal();
    const previousFocusRef = useRef<HTMLElement | null>(null);
    const queryClient = useQueryClient();
    const { executeAction, getLabel } = useActions();
    const { workspaceId: contextWorkspaceId, repos } = useWorkspaceContext();

    // Use prop workspaceId if provided, otherwise fall back to context
    const effectiveWorkspaceId = workspaceId ?? contextWorkspaceId;

    // Get visibility context for filtering actions
    const visibilityContext = useActionVisibilityContext();

    // Reducer context (stable reference for repos)
    const reducerContext = useMemo(() => ({ repos }), [repos]);

    // State machine with useReducer
    const [state, dispatch] = useReducer(
      (s: CommandBarState, e: CommandBarEvent) =>
        commandBarReducer(s, e, reducerContext)[0],
      { status: 'browsing', page, stack: [], search: '' } as CommandBarState
    );

    // Reset state when dialog opens
    useEffect(() => {
      if (modal.visible) {
        dispatch({ type: 'RESET', page });
      }
    }, [modal.visible, page]);

    // Derive current page from state
    const currentPage =
      state.status === 'selectingRepo' ? ('selectRepo' as PageId) : state.page;

    // Get workspace from cache for label resolution
    const workspace = effectiveWorkspaceId
      ? queryClient.getQueryData<Workspace>(
          attemptKeys.byId(effectiveWorkspaceId)
        )
      : undefined;

    // Build resolved page by processing childPages markers within groups
    // When searching on root page, also include actions from nested pages
    const getPageWithItems = useMemo(() => {
      return (pageId: PageId, searchQuery: string): ResolvedCommandBarPage => {
        // Handle dynamic selectRepo page
        if (pageId === 'selectRepo') {
          return {
            id: 'selectRepo',
            title: 'Select Repository',
            groups: [
              {
                label: 'Repositories',
                items: repos.map((repo) => ({
                  type: 'repo' as const,
                  repo: { id: repo.id, display_name: repo.display_name },
                })),
              },
            ],
          };
        }

        const basePage = Pages[pageId as StaticPageId];

        // Process each group, expanding childPages markers within
        const resolvedGroups: ResolvedGroup[] = basePage.items
          .map((group: CommandBarGroup): ResolvedGroup | null => {
            const resolvedItems = group.items.flatMap(
              (item: CommandBarGroupItem): ResolvedGroupItem[] => {
                if (item.type === 'childPages') {
                  const childPage = Pages[item.id as StaticPageId];
                  // Check page visibility condition
                  if (!isPageVisible(childPage, visibilityContext)) {
                    return [];
                  }
                  // Get icon based on page type
                  const pageIcons: Record<StaticPageId, typeof StackIcon> = {
                    root: SquaresFourIcon,
                    workspaceActions: StackIcon,
                    diffOptions: SlidersIcon,
                    viewOptions: SquaresFourIcon,
                    gitActions: GitBranchIcon,
                  };
                  return [
                    {
                      type: 'page' as const,
                      pageId: item.id,
                      label: childPage.title ?? item.id,
                      icon: pageIcons[item.id as StaticPageId],
                    },
                  ];
                }
                // For action items, filter by visibility condition
                if (item.type === 'action') {
                  if (!isActionVisible(item.action, visibilityContext)) {
                    return [];
                  }
                }
                // action or page items pass through
                return [item];
              }
            );

            // Return null for empty groups (will be filtered out)
            if (resolvedItems.length === 0) {
              return null;
            }

            return {
              label: group.label,
              items: resolvedItems,
            };
          })
          .filter((group): group is ResolvedGroup => group !== null);

        // When searching on root page, inject matching actions from nested pages
        if (pageId === 'root' && searchQuery.trim()) {
          const searchLower = searchQuery.toLowerCase();

          // Inject workspace actions if workspace is available
          if (visibilityContext.hasWorkspace) {
            const workspaceActions = getPageActions('workspaceActions');
            const matchingWorkspaceActions = workspaceActions
              .filter((action) => isActionVisible(action, visibilityContext))
              .filter((action) => {
                const label = resolveLabel(action, workspace);
                return (
                  label.toLowerCase().includes(searchLower) ||
                  action.id.toLowerCase().includes(searchLower)
                );
              });

            if (matchingWorkspaceActions.length > 0) {
              resolvedGroups.push({
                label: Pages.workspaceActions.title || 'Workspace Actions',
                items: matchingWorkspaceActions.map((action) => ({
                  type: 'action' as const,
                  action,
                })),
              });
            }
          }

          // Inject diff options (filtered by visibility)
          const diffActions = getPageActions('diffOptions');
          const matchingDiffActions = diffActions
            .filter((action) => isActionVisible(action, visibilityContext))
            .filter((action) => {
              const label = resolveLabel(action, workspace);
              return (
                label.toLowerCase().includes(searchLower) ||
                action.id.toLowerCase().includes(searchLower)
              );
            });

          if (matchingDiffActions.length > 0) {
            resolvedGroups.push({
              label: Pages.diffOptions.title || 'Diff Options',
              items: matchingDiffActions.map((action) => ({
                type: 'action' as const,
                action,
              })),
            });
          }

          // Inject view options (filtered by visibility)
          const viewActions = getPageActions('viewOptions');
          const matchingViewActions = viewActions
            .filter((action) => isActionVisible(action, visibilityContext))
            .filter((action) => {
              const label = resolveLabel(action, workspace);
              return (
                label.toLowerCase().includes(searchLower) ||
                action.id.toLowerCase().includes(searchLower)
              );
            });

          if (matchingViewActions.length > 0) {
            resolvedGroups.push({
              label: Pages.viewOptions.title || 'View Options',
              items: matchingViewActions.map((action) => ({
                type: 'action' as const,
                action,
              })),
            });
          }

          // Inject git actions if workspace has git repos
          if (visibilityContext.hasGitRepos) {
            const gitActions = getPageActions('gitActions');
            const matchingGitActions = gitActions
              .filter((action) => isActionVisible(action, visibilityContext))
              .filter((action) => {
                const label = resolveLabel(action, workspace);
                return (
                  label.toLowerCase().includes(searchLower) ||
                  action.id.toLowerCase().includes(searchLower)
                );
              });

            if (matchingGitActions.length > 0) {
              resolvedGroups.push({
                label: Pages.gitActions.title || 'Git Actions',
                items: matchingGitActions.map((action) => ({
                  type: 'action' as const,
                  action,
                })),
              });
            }
          }
        }

        return {
          id: basePage.id,
          title: basePage.title,
          groups: resolvedGroups,
        };
      };
    }, [visibilityContext, workspace, repos]);

    // Store the previously focused element when dialog opens
    useEffect(() => {
      if (modal.visible) {
        previousFocusRef.current = document.activeElement as HTMLElement;
      }
    }, [modal.visible]);

    // Go back to previous page
    const goBack = useCallback(() => {
      dispatch({ type: 'GO_BACK' });
    }, []);

    // Handle search changes
    const handleSearchChange = useCallback((query: string) => {
      dispatch({ type: 'SEARCH_CHANGE', query });
    }, []);

    // Handle item selection with side effects
    const handleSelect = useCallback(
      (item: ResolvedGroupItem) => {
        // Compute next state and effect
        const [, effect] = commandBarReducer(
          state,
          { type: 'SELECT_ITEM', item },
          reducerContext
        );

        // Dispatch the event to update state
        dispatch({ type: 'SELECT_ITEM', item });

        // Handle side effects
        if (effect.type === 'execute') {
          modal.hide();
          executeAction(effect.action, effectiveWorkspaceId, effect.repoId);
        }
      },
      [state, reducerContext, modal, executeAction, effectiveWorkspaceId]
    );

    // Get label for an action (with visibility context for dynamic labels)
    const getLabelForAction = useCallback(
      (action: ActionDefinition) =>
        getLabel(action, workspace, visibilityContext),
      [getLabel, workspace, visibilityContext]
    );

    const handleOpenChange = (open: boolean) => {
      if (!open) {
        modal.hide();
      }
    };

    // Restore focus to previously focused element when dialog closes
    const handleCloseAutoFocus = (event: Event) => {
      event.preventDefault();
      previousFocusRef.current?.focus();
    };

    const canGoBack = state.stack.length > 0;

    return (
      <CommandDialog
        open={modal.visible}
        onOpenChange={handleOpenChange}
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        <CommandBar
          page={getPageWithItems(currentPage, state.search)}
          canGoBack={canGoBack}
          onGoBack={goBack}
          onSelect={handleSelect}
          getLabel={getLabelForAction}
          search={state.search}
          onSearchChange={handleSearchChange}
        />
      </CommandDialog>
    );
  }
);

export const CommandBarDialog = defineModal<CommandBarDialogProps | void, void>(
  CommandBarDialogImpl
);
