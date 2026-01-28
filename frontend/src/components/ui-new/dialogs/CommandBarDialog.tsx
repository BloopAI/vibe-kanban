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
import type { Issue } from 'shared/remote-types';
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

/** Options for starting in priority selection mode */
export interface PendingPrioritySelection {
  projectId: string;
  issueIds: string[];
  /** When true, this is for changing priority of an issue being created (not yet saved) */
  isCreateMode?: boolean;
}

/** Options for starting in sub-issue selection mode */
export interface PendingSubIssueSelection {
  projectId: string;
  parentIssueId: string;
  /** 'addChild' = selected becomes child of parentIssueId, 'setParent' = parentIssueId becomes child of selected */
  mode?: 'addChild' | 'setParent';
}

export interface CommandBarDialogProps {
  page?: PageId;
  workspaceId?: string;
  repoId?: string;
  /** When provided, opens directly in repo selection mode for this git action */
  pendingGitAction?: GitActionDefinition;
  /** When provided, opens directly in status selection mode */
  pendingStatusSelection?: PendingStatusSelection;
  /** When provided, opens directly in priority selection mode */
  pendingPrioritySelection?: PendingPrioritySelection;
  /** When provided, opens directly in sub-issue selection mode */
  pendingSubIssueSelection?: PendingSubIssueSelection;
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
  pendingPrioritySelection?: PendingPrioritySelection;
  pendingSubIssueSelection?: PendingSubIssueSelection;
  propProjectId?: string;
  propIssueIds?: string[];
  statuses: StatusItem[];
  issues: Issue[];
  onStatusUpdate?: (issueIds: string[], statusId: string) => void;
  onPriorityUpdate?: (
    issueIds: string[],
    priority: 'urgent' | 'high' | 'medium' | 'low'
  ) => void;
  onAddSubIssue?: (parentIssueId: string, childIssueId: string) => void;
}

function CommandBarContent({
  page,
  workspaceId,
  initialRepoId,
  pendingGitAction,
  pendingStatusSelection,
  pendingPrioritySelection,
  pendingSubIssueSelection,
  propProjectId,
  propIssueIds,
  statuses,
  issues,
  onStatusUpdate,
  onPriorityUpdate,
  onAddSubIssue,
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
  // Also trigger status/priority selection if pending selection is provided
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

      // If we have pending priority selection, transition to that state
      if (pendingPrioritySelection) {
        dispatch({
          type: 'START_PRIORITY_SELECTION',
          projectId: pendingPrioritySelection.projectId,
          issueIds: pendingPrioritySelection.issueIds,
        });
      }

      // If we have pending sub-issue selection, transition to that state
      if (pendingSubIssueSelection) {
        dispatch({
          type: 'START_SUB_ISSUE_SELECTION',
          projectId: pendingSubIssueSelection.projectId,
          parentIssueId: pendingSubIssueSelection.parentIssueId,
        });
      }
    }
  }, [
    modal.visible,
    page,
    dispatch,
    pendingStatusSelection,
    pendingPrioritySelection,
    pendingSubIssueSelection,
  ]);

  // Resolve current page to renderable data
  const resolvedPage = useResolvedPage(
    currentPage,
    state.search,
    visibilityContext,
    workspace,
    repos,
    statuses,
    issues,
    pendingSubIssueSelection?.mode
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
      } else if (effect.type === 'updatePriority') {
        modal.hide();
        onPriorityUpdate?.(effect.issueIds, effect.priority);
      } else if (effect.type === 'addSubIssue') {
        modal.hide();
        onAddSubIssue?.(effect.parentIssueId, effect.childIssueId);
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
      onPriorityUpdate,
      onAddSubIssue,
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
        statuses={statuses}
      />
    </CommandDialog>
  );
}

/** Wrapper that provides ProjectContext for status/priority/sub-issue selection */
function CommandBarWithProjectContext({
  pendingStatusSelection,
  pendingPrioritySelection,
  pendingSubIssueSelection,
  propProjectId,
  ...props
}: Omit<
  CommandBarContentProps,
  | 'statuses'
  | 'issues'
  | 'onStatusUpdate'
  | 'onPriorityUpdate'
  | 'onAddSubIssue'
> & {
  pendingStatusSelection?: PendingStatusSelection;
  pendingPrioritySelection?: PendingPrioritySelection;
  pendingSubIssueSelection?: PendingSubIssueSelection;
}) {
  // For create mode, projectId may be empty - use propProjectId as fallback
  // Also check pendingPrioritySelection and pendingSubIssueSelection
  const effectiveProjectId =
    pendingStatusSelection?.projectId ||
    pendingPrioritySelection?.projectId ||
    pendingSubIssueSelection?.projectId ||
    propProjectId ||
    '';

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
        pendingPrioritySelection={pendingPrioritySelection}
        pendingSubIssueSelection={pendingSubIssueSelection}
      />
    </ProjectProvider>
  );
}

/** Inner component that uses ProjectContext to get statuses, issues, and handle updates */
function CommandBarWithStatuses(
  props: Omit<
    CommandBarContentProps,
    | 'statuses'
    | 'issues'
    | 'onStatusUpdate'
    | 'onPriorityUpdate'
    | 'onAddSubIssue'
  >
) {
  const { statuses, issues, updateIssue } = useProjectContext();
  const setKanbanCreateDefaultStatusId = useUiPreferencesStore(
    (s) => s.setKanbanCreateDefaultStatusId
  );
  const setKanbanCreateDefaultPriority = useUiPreferencesStore(
    (s) => s.setKanbanCreateDefaultPriority
  );

  const sortedStatuses: StatusItem[] = useMemo(
    () =>
      [...statuses]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((s) => ({ id: s.id, name: s.name, color: s.color })),
    [statuses]
  );

  // Build filtered issue list for sub-issue selection
  const filteredIssues: Issue[] = useMemo(() => {
    const anchorIssueId = props.pendingSubIssueSelection?.parentIssueId;
    const mode = props.pendingSubIssueSelection?.mode ?? 'addChild';
    if (!anchorIssueId) return [];

    // Build map for quick lookup
    const issuesById = new Map(issues.map((i) => [i.id, i]));

    // Get ancestor IDs (for addChild mode - prevent cycles when adding child)
    const getAncestorIds = (issueId: string): Set<string> => {
      const ancestors = new Set<string>();
      let current = issuesById.get(issueId);
      while (current?.parent_issue_id) {
        ancestors.add(current.parent_issue_id);
        current = issuesById.get(current.parent_issue_id);
      }
      return ancestors;
    };

    // Get descendant IDs (for setParent mode - prevent cycles when setting parent)
    const getDescendantIds = (issueId: string): Set<string> => {
      const descendants = new Set<string>();
      const queue = [issueId];
      while (queue.length > 0) {
        const currentId = queue.shift()!;
        for (const issue of issues) {
          if (
            issue.parent_issue_id === currentId &&
            !descendants.has(issue.id)
          ) {
            descendants.add(issue.id);
            queue.push(issue.id);
          }
        }
      }
      return descendants;
    };

    const anchorIssue = issuesById.get(anchorIssueId);

    if (mode === 'addChild') {
      // Adding a child to anchor: exclude ancestors to prevent cycles
      const ancestorIds = getAncestorIds(anchorIssueId);
      return issues.filter((issue) => {
        // Cannot be its own sub-issue
        if (issue.id === anchorIssueId) return false;
        // Cannot already be a sub-issue of this parent
        if (issue.parent_issue_id === anchorIssueId) return false;
        // Cannot be an ancestor (would create a cycle)
        if (ancestorIds.has(issue.id)) return false;
        return true;
      });
    } else {
      // Setting anchor as child of selected: exclude descendants to prevent cycles
      const descendantIds = getDescendantIds(anchorIssueId);
      return issues.filter((issue) => {
        // Cannot be its own parent
        if (issue.id === anchorIssueId) return false;
        // Cannot already be the parent
        if (anchorIssue?.parent_issue_id === issue.id) return false;
        // Cannot be a descendant (would create a cycle)
        if (descendantIds.has(issue.id)) return false;
        return true;
      });
    }
  }, [
    issues,
    props.pendingSubIssueSelection?.parentIssueId,
    props.pendingSubIssueSelection?.mode,
  ]);

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

  const handlePriorityUpdate = useCallback(
    (issueIds: string[], priority: 'urgent' | 'high' | 'medium' | 'low') => {
      // Check if this is for create mode (empty issueIds array with isCreateMode flag)
      if (props.pendingPrioritySelection?.isCreateMode) {
        // Update the default priority for the issue being created
        setKanbanCreateDefaultPriority(priority);
        return;
      }

      // Normal edit mode: update existing issues
      for (const issueId of issueIds) {
        updateIssue(issueId, { priority });
      }
    },
    [
      updateIssue,
      props.pendingPrioritySelection?.isCreateMode,
      setKanbanCreateDefaultPriority,
    ]
  );

  const handleAddSubIssue = useCallback(
    (anchorIssueId: string, selectedIssueId: string) => {
      const mode = props.pendingSubIssueSelection?.mode ?? 'addChild';
      if (mode === 'addChild') {
        // Selected becomes child of anchor
        updateIssue(selectedIssueId, { parent_issue_id: anchorIssueId });
      } else {
        // Anchor becomes child of selected
        updateIssue(anchorIssueId, { parent_issue_id: selectedIssueId });
      }
    },
    [updateIssue, props.pendingSubIssueSelection?.mode]
  );

  return (
    <CommandBarContent
      {...props}
      statuses={sortedStatuses}
      issues={filteredIssues}
      onStatusUpdate={handleStatusUpdate}
      onPriorityUpdate={handlePriorityUpdate}
      onAddSubIssue={handleAddSubIssue}
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
    pendingPrioritySelection,
    pendingSubIssueSelection,
    projectId: propProjectId,
    issueIds: propIssueIds,
  }) => {
    // If we have pending status, priority, or sub-issue selection, wrap with ProjectProvider
    if (
      pendingStatusSelection ||
      pendingPrioritySelection ||
      pendingSubIssueSelection
    ) {
      return (
        <CommandBarWithProjectContext
          page={page}
          workspaceId={workspaceId}
          initialRepoId={initialRepoId}
          pendingGitAction={pendingGitAction}
          pendingStatusSelection={pendingStatusSelection}
          pendingPrioritySelection={pendingPrioritySelection}
          pendingSubIssueSelection={pendingSubIssueSelection}
          propProjectId={propProjectId}
          propIssueIds={propIssueIds}
        />
      );
    }

    // Normal command bar without status/priority/sub-issue context
    return (
      <CommandBarContent
        page={page}
        workspaceId={workspaceId}
        initialRepoId={initialRepoId}
        pendingGitAction={pendingGitAction}
        propProjectId={propProjectId}
        propIssueIds={propIssueIds}
        statuses={[]}
        issues={[]}
      />
    );
  }
);

export const CommandBarDialog = defineModal<CommandBarDialogProps | void, void>(
  CommandBarDialogImpl
);
