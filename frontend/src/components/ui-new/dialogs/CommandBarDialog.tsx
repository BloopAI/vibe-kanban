import { useRef, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useQueryClient } from '@tanstack/react-query';
import type { Workspace } from 'shared/types';
import { defineModal } from '@/lib/modals';
import { CommandDialog } from '@/components/ui-new/primitives/Command';
import { CommandBar } from '@/components/ui-new/primitives/CommandBar';
import { useActions } from '@/contexts/ActionsContext';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { attemptKeys } from '@/hooks/useAttempt';
import type {
  PageId,
  ResolvedGroupItem,
} from '@/components/ui-new/actions/pages';
import {
  type GitActionDefinition,
  ActionTargetType,
} from '@/components/ui-new/actions';
import { useActionVisibilityContext } from '@/components/ui-new/actions/useActionVisibility';
import { useCommandBarState } from './commandBar/useCommandBarState';
import { useResolvedPage } from './commandBar/useResolvedPage';

export interface CommandBarDialogProps {
  page?: PageId;
  workspaceId?: string;
  repoId?: string;
  /** When provided, opens directly in repo selection mode for this git action */
  pendingGitAction?: GitActionDefinition;
  /** Issue context for kanban mode - projectId */
  projectId?: string;
  /** Issue context for kanban mode - selected issue IDs */
  issueIds?: string[];
}

function CommandBarContent({
  page,
  workspaceId,
  initialRepoId,
  pendingGitAction,
  propProjectId,
  propIssueIds,
}: {
  page: PageId;
  workspaceId?: string;
  initialRepoId?: string;
  pendingGitAction?: GitActionDefinition;
  propProjectId?: string;
  propIssueIds?: string[];
}) {
  const modal = useModal();
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const queryClient = useQueryClient();
  const { executeAction, getLabel } = useActions();
  const { workspaceId: contextWorkspaceId, repos } = useWorkspaceContext();
  const visibilityContext = useActionVisibilityContext();

  // Get issue context from props or route params (URL is single source of truth)
  const { projectId: routeProjectId, issueId: routeIssueId } = useParams<{
    projectId: string;
    issueId?: string;
  }>();

  // Effective issue context
  const effectiveProjectId = propProjectId ?? routeProjectId;
  const effectiveIssueIds = useMemo(
    () => propIssueIds ?? (routeIssueId ? [routeIssueId] : []),
    [propIssueIds, routeIssueId]
  );

  const effectiveWorkspaceId = workspaceId ?? contextWorkspaceId;
  const workspace = effectiveWorkspaceId
    ? queryClient.getQueryData<Workspace>(
        attemptKeys.byId(effectiveWorkspaceId)
      )
    : undefined;

  // State machine
  const { state, currentPage, canGoBack, dispatch } = useCommandBarState(
    page,
    repos.length,
    pendingGitAction
  );

  // Reset state and capture focus when dialog opens
  useEffect(() => {
    if (modal.visible) {
      dispatch({ type: 'RESET', page });
      previousFocusRef.current = document.activeElement as HTMLElement;
    }
  }, [modal.visible, page, dispatch]);

  // Resolve current page to renderable data
  const resolvedPage = useResolvedPage(
    currentPage,
    state.search,
    visibilityContext,
    workspace,
    repos
  );

  // Handle item selection with side effects
  const handleSelect = useCallback(
    (item: ResolvedGroupItem) => {
      // If initialRepoId is provided and user selects a git action,
      // execute immediately without going through repo selection
      if (
        initialRepoId &&
        item.type === 'action' &&
        item.action.requiresTarget === ActionTargetType.GIT
      ) {
        modal.hide();
        executeAction(item.action, effectiveWorkspaceId, initialRepoId);
        return;
      }

      const effect = dispatch({ type: 'SELECT_ITEM', item });

      if (effect.type === 'execute') {
        modal.hide();
        // Handle issue actions
        if (effect.action.requiresTarget === ActionTargetType.ISSUE) {
          executeAction(
            effect.action,
            undefined,
            effectiveProjectId,
            effectiveIssueIds
          );
        } else {
          const repoId =
            effect.repoId === '__single__' ? repos[0]?.id : effect.repoId;
          executeAction(effect.action, effectiveWorkspaceId, repoId);
        }
      }
    },
    [
      dispatch,
      modal,
      executeAction,
      effectiveWorkspaceId,
      effectiveProjectId,
      effectiveIssueIds,
      repos,
      initialRepoId,
    ]
  );

  // Restore focus when dialog closes (unless another dialog has taken focus)
  const handleCloseAutoFocus = useCallback((event: Event) => {
    event.preventDefault();
    // Don't restore focus if another dialog has taken over (e.g., action opened a new dialog)
    const activeElement = document.activeElement;
    const isInDialog = activeElement?.closest('[role="dialog"]');
    if (!isInDialog) {
      previousFocusRef.current?.focus();
    }
  }, []);

  return (
    <CommandDialog
      open={modal.visible}
      onOpenChange={(open) => !open && modal.hide()}
      onCloseAutoFocus={handleCloseAutoFocus}
    >
      <CommandBar
        page={resolvedPage}
        canGoBack={canGoBack}
        onGoBack={() => dispatch({ type: 'GO_BACK' })}
        onSelect={handleSelect}
        getLabel={(action) => getLabel(action, workspace, visibilityContext)}
        search={state.search}
        onSearchChange={(query) => dispatch({ type: 'SEARCH_CHANGE', query })}
      />
    </CommandDialog>
  );
}

const CommandBarDialogImpl = NiceModal.create<CommandBarDialogProps>(
  ({
    page = 'root',
    workspaceId,
    repoId: initialRepoId,
    pendingGitAction,
    projectId: propProjectId,
    issueIds: propIssueIds,
  }) => {
    return (
      <CommandBarContent
        page={page}
        workspaceId={workspaceId}
        initialRepoId={initialRepoId}
        pendingGitAction={pendingGitAction}
        propProjectId={propProjectId}
        propIssueIds={propIssueIds}
      />
    );
  }
);

export const CommandBarDialog = defineModal<CommandBarDialogProps | void, void>(
  CommandBarDialogImpl
);
