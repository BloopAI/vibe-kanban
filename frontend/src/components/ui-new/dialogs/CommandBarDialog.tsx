import { useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useQueryClient } from '@tanstack/react-query';
import type { Workspace } from 'shared/types';
import { defineModal } from '@/lib/modals';
import { CommandDialog } from '@/components/ui-new/primitives/Command';
import { CommandBar } from '@/components/ui-new/primitives/CommandBar';
import { useActions } from '@/contexts/ActionsContext';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
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
import { useUiPreferencesStore } from '@/stores/useUiPreferencesStore';

/** Options for starting in status selection mode */
export interface PendingStatusSelection {
  projectId: string;
  issueIds: string[];
  /** When true, this is for changing status of an issue being created (not yet saved) */
  isCreateMode?: boolean;
  /** Callback for create-mode status changes (bypasses URL params) */
  onCreateModeUpdate?: (statusId: string) => void;
}

/** Options for starting in priority selection mode */
export interface PendingPrioritySelection {
  projectId: string;
  issueIds: string[];
  /** When true, this is for changing priority of an issue being created (not yet saved) */
  isCreateMode?: boolean;
  /** Callback for create-mode priority changes (bypasses URL params) */
  onCreateModeUpdate?: (
    priority: 'urgent' | 'high' | 'medium' | 'low' | null
  ) => void;
}

/** Options for starting in sub-issue selection mode */
export interface PendingSubIssueSelection {
  projectId: string;
  parentIssueId: string;
  /** 'addChild' = selected becomes child of parentIssueId, 'setParent' = parentIssueId becomes child of selected */
  mode?: 'addChild' | 'setParent';
}

/** Options for starting in relationship issue selection mode */
export interface PendingRelationshipSelection {
  projectId: string;
  issueId: string;
  relationshipType: 'blocking' | 'related' | 'has_duplicate';
  direction: 'forward' | 'reverse';
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
  /** When provided, opens directly in relationship issue selection mode */
  pendingRelationshipSelection?: PendingRelationshipSelection;
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
  pendingRelationshipSelection?: PendingRelationshipSelection;
  propProjectId?: string;
  propIssueIds?: string[];
  statuses: StatusItem[];
  issues: Issue[];
  onStatusUpdate?: (issueIds: string[], statusId: string) => void;
  onPriorityUpdate?: (
    issueIds: string[],
    priority: 'urgent' | 'high' | 'medium' | 'low' | null
  ) => void;
  onAddSubIssue?: (parentIssueId: string, childIssueId: string) => void;
  onCreateSubIssue?: (parentIssueId: string) => void;
  onAddRelationship?: (
    issueId: string,
    relatedIssueId: string,
    relationshipType: 'blocking' | 'related' | 'has_duplicate',
    direction: 'forward' | 'reverse'
  ) => void;
}

function CommandBarContent({
  page,
  workspaceId,
  initialRepoId,
  pendingGitAction,
  pendingStatusSelection,
  pendingPrioritySelection,
  pendingSubIssueSelection,
  pendingRelationshipSelection,
  propProjectId,
  propIssueIds,
  statuses,
  issues,
  onStatusUpdate,
  onPriorityUpdate,
  onAddSubIssue,
  onCreateSubIssue,
  onAddRelationship,
}: CommandBarContentProps) {
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

      // If we have pending relationship selection, transition to that state
      if (pendingRelationshipSelection) {
        dispatch({
          type: 'START_RELATIONSHIP_SELECTION',
          projectId: pendingRelationshipSelection.projectId,
          issueId: pendingRelationshipSelection.issueId,
          relationshipType: pendingRelationshipSelection.relationshipType,
          direction: pendingRelationshipSelection.direction,
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
    pendingRelationshipSelection,
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
      } else if (effect.type === 'createSubIssue') {
        modal.hide();
        onCreateSubIssue?.(effect.parentIssueId);
      } else if (effect.type === 'addRelationship') {
        modal.hide();
        onAddRelationship?.(
          effect.issueId,
          effect.relatedIssueId,
          effect.relationshipType,
          effect.direction
        );
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
      onCreateSubIssue,
      onAddRelationship,
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

/** Wrapper that provides ProjectContext for status/priority/sub-issue/relationship selection */
function CommandBarWithProjectContext({
  pendingStatusSelection,
  pendingPrioritySelection,
  pendingSubIssueSelection,
  pendingRelationshipSelection,
  propProjectId,
  ...props
}: Omit<
  CommandBarContentProps,
  | 'statuses'
  | 'issues'
  | 'onStatusUpdate'
  | 'onPriorityUpdate'
  | 'onAddSubIssue'
  | 'onCreateSubIssue'
  | 'onAddRelationship'
> & {
  pendingStatusSelection?: PendingStatusSelection;
  pendingPrioritySelection?: PendingPrioritySelection;
  pendingSubIssueSelection?: PendingSubIssueSelection;
  pendingRelationshipSelection?: PendingRelationshipSelection;
}) {
  // For create mode, projectId may be empty - use propProjectId as fallback
  const effectiveProjectId =
    pendingStatusSelection?.projectId ||
    pendingPrioritySelection?.projectId ||
    pendingSubIssueSelection?.projectId ||
    pendingRelationshipSelection?.projectId ||
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
        pendingRelationshipSelection={pendingRelationshipSelection}
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
    | 'onCreateSubIssue'
    | 'onAddRelationship'
  >
) {
  const {
    statuses,
    issues,
    updateIssue,
    insertIssueRelationship,
    issueRelationships,
  } = useProjectContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();

  // Update URL params for create mode defaults
  const updateCreateDefaults = useCallback(
    (updates: { statusId?: string; priority?: string | null }) => {
      const newParams = new URLSearchParams(searchParams);
      if (updates.statusId !== undefined) {
        newParams.set('statusId', updates.statusId);
      }
      if (updates.priority !== undefined) {
        if (updates.priority === null) {
          newParams.delete('priority');
        } else {
          newParams.set('priority', updates.priority);
        }
      }
      setSearchParams(newParams, { replace: true });
    },
    [searchParams, setSearchParams]
  );
  const kanbanViewMode = useUiPreferencesStore((s) => s.kanbanViewMode);
  const listViewStatusFilter = useUiPreferencesStore(
    (s) => s.listViewStatusFilter
  );

  const sortedStatuses: StatusItem[] = useMemo(
    () =>
      [...statuses]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((s) => ({ id: s.id, name: s.name, color: s.color })),
    [statuses]
  );

  // Visible statuses (non-hidden) for default status selection
  const visibleStatuses = useMemo(
    () =>
      [...statuses]
        .filter((s) => !s.hidden)
        .sort((a, b) => a.sort_order - b.sort_order),
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
        if (props.pendingStatusSelection.onCreateModeUpdate) {
          props.pendingStatusSelection.onCreateModeUpdate(statusId);
        } else {
          updateCreateDefaults({ statusId });
        }
        return;
      }

      // Normal edit mode: update existing issues
      for (const issueId of issueIds) {
        updateIssue(issueId, { status_id: statusId });
      }
    },
    [updateIssue, props.pendingStatusSelection, updateCreateDefaults]
  );

  const handlePriorityUpdate = useCallback(
    (
      issueIds: string[],
      priority: 'urgent' | 'high' | 'medium' | 'low' | null
    ) => {
      // Check if this is for create mode (empty issueIds array with isCreateMode flag)
      if (props.pendingPrioritySelection?.isCreateMode) {
        if (props.pendingPrioritySelection.onCreateModeUpdate) {
          props.pendingPrioritySelection.onCreateModeUpdate(priority);
        } else {
          updateCreateDefaults({ priority });
        }
        return;
      }

      // Normal edit mode: update existing issues
      for (const issueId of issueIds) {
        updateIssue(issueId, { priority });
      }
    },
    [updateIssue, props.pendingPrioritySelection, updateCreateDefaults]
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

  const handleCreateSubIssue = useCallback(
    (parentIssueId: string) => {
      if (!projectId) return;

      // Compute default status based on current view/tab (same logic as KanbanContainer)
      let defaultStatusId: string | null = null;
      if (kanbanViewMode === 'kanban') {
        // Kanban view: first visible (non-hidden) status
        defaultStatusId = visibleStatuses[0]?.id ?? null;
      } else if (listViewStatusFilter) {
        // List view with specific status tab selected
        defaultStatusId = listViewStatusFilter;
      } else {
        // List view "All" tab: first status by sort order
        defaultStatusId =
          [...statuses].sort((a, b) => a.sort_order - b.sort_order)[0]?.id ??
          null;
      }
      // Navigate to create mode with parent issue and default status pre-set
      const params = new URLSearchParams({ mode: 'create' });
      if (defaultStatusId) params.set('statusId', defaultStatusId);
      params.set('parentIssueId', parentIssueId);
      navigate(`/projects/${projectId}?${params.toString()}`);
    },
    [
      projectId,
      navigate,
      kanbanViewMode,
      listViewStatusFilter,
      visibleStatuses,
      statuses,
    ]
  );

  // Build filtered issue list for relationship selection
  const relationshipFilteredIssues: Issue[] = useMemo(() => {
    const anchorIssueId = props.pendingRelationshipSelection?.issueId;
    if (!anchorIssueId) return [];

    // Get existing relationships for this issue
    const existingRelatedIds = new Set(
      issueRelationships
        .filter(
          (r) =>
            r.issue_id === anchorIssueId || r.related_issue_id === anchorIssueId
        )
        .flatMap((r) => [r.issue_id, r.related_issue_id])
    );

    return issues.filter((issue) => {
      if (issue.id === anchorIssueId) return false;
      if (existingRelatedIds.has(issue.id)) return false;
      return true;
    });
  }, [issues, issueRelationships, props.pendingRelationshipSelection?.issueId]);

  const handleAddRelationship = useCallback(
    (
      issueId: string,
      relatedIssueId: string,
      relationshipType: 'blocking' | 'related' | 'has_duplicate',
      direction: 'forward' | 'reverse'
    ) => {
      if (direction === 'forward') {
        insertIssueRelationship({
          issue_id: issueId,
          related_issue_id: relatedIssueId,
          relationship_type: relationshipType,
        });
      } else {
        insertIssueRelationship({
          issue_id: relatedIssueId,
          related_issue_id: issueId,
          relationship_type: relationshipType,
        });
      }
    },
    [insertIssueRelationship]
  );

  // Pick the right filtered issues list based on which selection is active
  const effectiveIssues = props.pendingRelationshipSelection
    ? relationshipFilteredIssues
    : filteredIssues;

  return (
    <CommandBarContent
      {...props}
      statuses={sortedStatuses}
      issues={effectiveIssues}
      onStatusUpdate={handleStatusUpdate}
      onPriorityUpdate={handlePriorityUpdate}
      onAddSubIssue={handleAddSubIssue}
      onCreateSubIssue={handleCreateSubIssue}
      onAddRelationship={handleAddRelationship}
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
    pendingRelationshipSelection,
    projectId: propProjectId,
    issueIds: propIssueIds,
  }) => {
    // If we have pending selection, wrap with ProjectProvider
    if (
      pendingStatusSelection ||
      pendingPrioritySelection ||
      pendingSubIssueSelection ||
      pendingRelationshipSelection
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
          pendingRelationshipSelection={pendingRelationshipSelection}
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
