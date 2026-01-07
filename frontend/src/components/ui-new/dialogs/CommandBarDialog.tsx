import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useQueryClient } from '@tanstack/react-query';
import { StackIcon } from '@phosphor-icons/react';
import type { Workspace } from 'shared/types';
import { defineModal } from '@/lib/modals';
import { CommandDialog } from '@/components/ui-new/primitives/Command';
import { CommandBar } from '@/components/ui-new/primitives/CommandBar';
import { useActions } from '@/contexts/ActionsContext';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { attemptKeys } from '@/hooks/useAttempt';
import { type ActionDefinition } from '@/components/ui-new/actions';
import {
  Pages,
  getPageActions,
  type PageId,
  type CommandBarGroup,
  type CommandBarGroupItem,
  type ResolvedGroup,
  type ResolvedGroupItem,
} from '@/components/ui-new/actions/pages';
import { resolveLabel } from '@/components/ui-new/actions';

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
    const { workspaceId: contextWorkspaceId } = useWorkspaceContext();

    // Use prop workspaceId if provided, otherwise fall back to context
    const effectiveWorkspaceId = workspaceId ?? contextWorkspaceId;

    // Page navigation state (lifted from CommandBar)
    const [currentPage, setCurrentPage] = useState<PageId>(page);
    const [pageStack, setPageStack] = useState<PageId[]>([]);
    // Search state - cleared when page changes
    const [search, setSearch] = useState('');

    // Reset page state when dialog opens
    useEffect(() => {
      if (modal.visible) {
        setCurrentPage(page);
        setPageStack([]);
        setSearch('');
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
        const basePage = Pages[pageId];

        // Process each group, expanding childPages markers within
        const resolvedGroups: ResolvedGroup[] = basePage.items
          .map((group: CommandBarGroup): ResolvedGroup | null => {
            const resolvedItems = group.items.flatMap(
              (item: CommandBarGroupItem): ResolvedGroupItem[] => {
                if (item.type === 'childPages') {
                  // Only insert page link if conditions are met
                  if (item.id === 'workspaceActions' && effectiveWorkspaceId) {
                    return [
                      {
                        type: 'page' as const,
                        pageId: item.id,
                        label: 'Workspace Actions',
                        icon: StackIcon,
                      },
                    ];
                  }
                  // Condition not met, remove marker
                  return [];
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
        if (pageId === 'root' && searchQuery.trim() && effectiveWorkspaceId) {
          const workspaceActions = getPageActions('workspaceActions');
          const searchLower = searchQuery.toLowerCase();

          // Filter actions that match the search query by label
          const matchingActions = workspaceActions.filter((action) => {
            const label = resolveLabel(action, workspace);
            return (
              label.toLowerCase().includes(searchLower) ||
              action.id.toLowerCase().includes(searchLower)
            );
          });

          if (matchingActions.length > 0) {
            resolvedGroups.push({
              label: Pages.workspaceActions.title || 'Workspace Actions',
              items: matchingActions.map((action) => ({
                type: 'action' as const,
                action,
              })),
            });
          }
        }

        return {
          id: basePage.id,
          title: basePage.title,
          groups: resolvedGroups,
        };
      };
    }, [effectiveWorkspaceId, workspace]);

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
      }
    }, [pageStack]);

    // Handle item selection
    const handleSelect = useCallback(
      async (item: ResolvedGroupItem) => {
        if (item.type === 'page') {
          navigateToPage(item.pageId);
        } else if (item.type === 'action') {
          modal.hide();
          await executeAction(item.action, effectiveWorkspaceId);
        }
      },
      [navigateToPage, modal, executeAction, effectiveWorkspaceId]
    );

    // Get label for an action
    const getLabelForAction = useCallback(
      (action: ActionDefinition) => getLabel(action, workspace),
      [getLabel, workspace]
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
