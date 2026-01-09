import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
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

    // Page navigation state (lifted from CommandBar)
    const [currentPage, setCurrentPage] = useState<PageId>(page);
    const [pageStack, setPageStack] = useState<PageId[]>([]);
    // Search state - cleared when page changes
    const [search, setSearch] = useState('');
    // Pending git action waiting for repo selection
    const [pendingGitAction, setPendingGitAction] =
      useState<GitActionDefinition | null>(null);

    // Reset page state when dialog opens
    useEffect(() => {
      if (modal.visible) {
        setCurrentPage(page);
        setPageStack([]);
        setSearch('');
        setPendingGitAction(null);
      }
    }, [modal.visible, page]);

    // Clear search when navigating to a new page
    useEffect(() => {
      setSearch('');
    }, [currentPage]);

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

    // Navigate to another page
    const navigateToPage = useCallback(
      (pageId: PageId) => {
        setPageStack((prev) => [...prev, currentPage]);
        setCurrentPage(pageId);
      },
      [currentPage]
    );

    // Go back to previous page
    const goBack = useCallback(() => {
      const prevPage = pageStack[pageStack.length - 1];
      if (prevPage) {
        setPageStack((prev) => prev.slice(0, -1));
        setCurrentPage(prevPage);
        // Clear pending git action when navigating back from selectRepo
        if (currentPage === 'selectRepo') {
          setPendingGitAction(null);
        }
      }
    }, [pageStack, currentPage]);

    // Handle item selection
    const handleSelect = useCallback(
      async (item: ResolvedGroupItem) => {
        if (item.type === 'page') {
          navigateToPage(item.pageId);
        } else if (item.type === 'repo') {
          // User selected a repo - execute the pending git action
          if (pendingGitAction && effectiveWorkspaceId) {
            modal.hide();
            await executeAction(
              pendingGitAction,
              effectiveWorkspaceId,
              item.repo.id
            );
            setPendingGitAction(null);
          }
        } else if (item.type === 'action') {
          // Check if this is a git action that needs repo selection
          if (item.action.requiresTarget === 'git') {
            if (repos.length === 1) {
              // Single repo - execute immediately
              modal.hide();
              await executeAction(
                item.action,
                effectiveWorkspaceId,
                repos[0].id
              );
            } else if (repos.length > 1) {
              // Multiple repos - show repo selection page
              setPendingGitAction(item.action as GitActionDefinition);
              navigateToPage('selectRepo');
            }
          } else {
            // Non-git action - execute normally
            modal.hide();
            await executeAction(item.action, effectiveWorkspaceId);
          }
        }
      },
      [
        navigateToPage,
        modal,
        executeAction,
        effectiveWorkspaceId,
        repos,
        pendingGitAction,
      ]
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

    const canGoBack = pageStack.length > 0;

    return (
      <CommandDialog
        open={modal.visible}
        onOpenChange={handleOpenChange}
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        <CommandBar
          page={getPageWithItems(currentPage, search)}
          canGoBack={canGoBack}
          onGoBack={goBack}
          onSelect={handleSelect}
          getLabel={getLabelForAction}
          search={search}
          onSearchChange={setSearch}
        />
      </CommandDialog>
    );
  }
);

export const CommandBarDialog = defineModal<CommandBarDialogProps | void, void>(
  CommandBarDialogImpl
);
