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
import { useUiPreferencesStore } from '@/stores/useUiPreferencesStore';
import { attemptKeys } from '@/hooks/useAttempt';
import type {
  PageId,
  ResolvedGroupItem,
  StatusItem,
} from '@/components/ui-new/actions/pages';
import {
  type GitActionDefinition,
  ActionTargetType,
} from '@/components/ui-new/actions';
import { useActionVisibilityContext } from '@/components/ui-new/actions/useActionVisibility';
import { useCommandBarState } from './commandBar/useCommandBarState';
import { useResolvedPage } from './commandBar/useResolvedPage';
import {
  ProjectProvider,
  useProjectContext,
} from '@/contexts/remote/ProjectContext';

/** Options for starting in status selection mode */
export interface PendingStatusSelection {
  projectId: string;
  issueIds: string[];
  /** When true, this is for changing status of an issue being created (not yet saved) */
  isCreateMode?: boolean;
}

export interface CommandBarDialogProps {
  page?: PageId;
  workspaceId?: string;
  repoId?: string;
  /** When provided, opens directly in repo selection mode for this git action */
  pendingGitAction?: GitActionDefinition;
  /** When provided, opens directly in status selection mode */
  pendingStatusSelection?: PendingStatusSelection;
  /** Issue context for kanban mode - projectId */
  projectId?: string;
  /** Issue context for kanban mode - selected issue IDs */
  issueIds?: string[];
}

/** Inner content component that optionally uses ProjectContext */
interface CommandBarContentProps {
  page: PageId;
  workspaceId?: string;
  initialRepoId?: string;
  pendingGitAction?: GitActionDefinition;
  pendingStatusSelection?: PendingStatusSelection;
  propProjectId?: string;
  propIssueIds?: string[];
  statuses: StatusItem[];
  onStatusUpdate?: (issueIds: string[], statusId: string) => void;
}

function CommandBarContent({
  page,
  workspaceId,
  initialRepoId,
  pendingGitAction,
  pendingStatusSelection,
  propProjectId,
  propIssueIds,
  statuses,
  onStatusUpdate,
}: CommandBarContentProps) {
  const modal = useModal();
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const queryClient = useQueryClient();
  const { executeAction, getLabel } = useActions();
  const { workspaceId: contextWorkspaceId, repos } = useWorkspaceContext();
  const visibilityContext = useActionVisibilityContext();

  // Get issue context from props, route params, or store
  const { projectId: routeProjectId } = useParams<{ projectId: string }>();
  const selectedKanbanIssueId = useUiPreferencesStore(
    (s) => s.selectedKanbanIssueId
  );

  // Effective issue context
  const effectiveProjectId = propProjectId ?? routeProjectId;
  const effectiveIssueIds = useMemo(
    () =>
      propIssueIds ?? (selectedKanbanIssueId ? [selectedKanbanIssueId] : []),
    [propIssueIds, selectedKanbanIssueId]
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
  // Also trigger status selection if pendingStatusSelection is provided
  useEffect(() => {
    if (modal.visible) {
      dispatch({ type: 'RESET', page });
      previousFocusRef.current = document.activeElement as HTMLElement;

      // If we have pending status selection, transition to that state
      if (pendingStatusSelection) {
        dispatch({
          type: 'START_STATUS_SELECTION',
          projectId: pendingStatusSelection.projectId,
          issueIds: pendingStatusSelection.issueIds,
        });
      }
    }
  }, [modal.visible, page, dispatch, pendingStatusSelection]);

  // Resolve current page to renderable data
  const resolvedPage = useResolvedPage(
    currentPage,
    state.search,
    visibilityContext,
    workspace,
    repos,
    statuses
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
      } else if (effect.type === 'updateStatus') {
        modal.hide();
        onStatusUpdate?.(effect.issueIds, effect.statusId);
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
      onStatusUpdate,
    ]
  );

  // Restore focus when dialog closes
  const handleCloseAutoFocus = useCallback((event: Event) => {
    event.preventDefault();
    previousFocusRef.current?.focus();
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

/** Wrapper that provides ProjectContext for status selection */
function CommandBarWithProjectContext({
  pendingStatusSelection,
  propProjectId,
  ...props
}: Omit<CommandBarContentProps, 'statuses' | 'onStatusUpdate'> & {
  pendingStatusSelection: PendingStatusSelection;
}) {
  // For create mode, projectId may be empty - use propProjectId as fallback
  const effectiveProjectId =
    pendingStatusSelection.projectId || propProjectId || '';

  // If no project ID available, render nothing (shouldn't happen in practice)
  if (!effectiveProjectId) {
    return null;
  }

  return (
    <ProjectProvider projectId={effectiveProjectId}>
      <CommandBarWithStatuses
        {...props}
        propProjectId={propProjectId}
        pendingStatusSelection={pendingStatusSelection}
      />
    </ProjectProvider>
  );
}

/** Inner component that uses ProjectContext to get statuses */
function CommandBarWithStatuses(
  props: Omit<CommandBarContentProps, 'statuses' | 'onStatusUpdate'>
) {
  const { statuses, updateIssue } = useProjectContext();
  const setKanbanCreateDefaultStatusId = useUiPreferencesStore(
    (s) => s.setKanbanCreateDefaultStatusId
  );

  const sortedStatuses: StatusItem[] = useMemo(
    () =>
      [...statuses]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((s) => ({ id: s.id, name: s.name, color: s.color })),
    [statuses]
  );

  const handleStatusUpdate = useCallback(
    (issueIds: string[], statusId: string) => {
      // Check if this is for create mode (empty issueIds array with isCreateMode flag)
      if (props.pendingStatusSelection?.isCreateMode) {
        // Update the default status for the issue being created
        setKanbanCreateDefaultStatusId(statusId);
        return;
      }

      // Normal edit mode: update existing issues
      for (const issueId of issueIds) {
        updateIssue(issueId, { status_id: statusId });
      }
    },
    [
      updateIssue,
      props.pendingStatusSelection?.isCreateMode,
      setKanbanCreateDefaultStatusId,
    ]
  );

  return (
    <CommandBarContent
      {...props}
      statuses={sortedStatuses}
      onStatusUpdate={handleStatusUpdate}
    />
  );
}

const CommandBarDialogImpl = NiceModal.create<CommandBarDialogProps>(
  ({
    page = 'root',
    workspaceId,
    repoId: initialRepoId,
    pendingGitAction,
    pendingStatusSelection,
    projectId: propProjectId,
    issueIds: propIssueIds,
  }) => {
    // If we have pending status selection, wrap with ProjectProvider
    if (pendingStatusSelection) {
      return (
        <CommandBarWithProjectContext
          page={page}
          workspaceId={workspaceId}
          initialRepoId={initialRepoId}
          pendingGitAction={pendingGitAction}
          pendingStatusSelection={pendingStatusSelection}
          propProjectId={propProjectId}
          propIssueIds={propIssueIds}
        />
      );
    }

    // Normal command bar without status context
    return (
      <CommandBarContent
        page={page}
        workspaceId={workspaceId}
        initialRepoId={initialRepoId}
        pendingGitAction={pendingGitAction}
        propProjectId={propProjectId}
        propIssueIds={propIssueIds}
        statuses={[]}
      />
    );
  }
);

export const CommandBarDialog = defineModal<CommandBarDialogProps | void, void>(
  CommandBarDialogImpl
);
