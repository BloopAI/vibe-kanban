import {
  useMemo,
  useCallback,
  useState,
  useEffect,
  useRef,
  type MouseEvent,
  type RefObject,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useProjectContext } from '@/shared/hooks/useProjectContext';
import { useOrgContext } from '@/shared/hooks/useOrgContext';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';
import { useActions } from '@/shared/hooks/useActions';
import { useAuth } from '@/shared/hooks/auth/useAuth';
import { useUserSystem } from '@/shared/hooks/useUserSystem';
import { useAppNavigation } from '@/shared/hooks/useAppNavigation';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { cn } from '@/shared/lib/utils';
import { useCurrentKanbanRouteState } from '@/shared/hooks/useCurrentKanbanRouteState';
import {
  useUiPreferencesStore,
  resolveKanbanProjectState,
  KANBAN_ASSIGNEE_FILTER_VALUES,
  KANBAN_PROJECT_VIEW_IDS,
  type KanbanFilterState,
  type KanbanSortField,
} from '@/shared/stores/useUiPreferencesStore';
import {
  useKanbanFilters,
  PRIORITY_ORDER,
} from '../model/hooks/useKanbanFilters';
import {
  bulkUpdateIssues,
  type BulkUpdateIssueItem,
} from '@/shared/lib/remoteApi';
import {
  CaretLeftIcon,
  DotsThreeIcon,
  PlusIcon,
  XIcon,
} from '@phosphor-icons/react';
import { Actions } from '@/shared/actions';
import {
  buildKanbanIssueComposerKey,
  closeKanbanIssueComposer,
  openKanbanIssueComposer,
  type ProjectIssueCreateOptions,
  useKanbanIssueComposer,
} from '@/shared/stores/useKanbanIssueComposerStore';
import type { OrganizationMemberWithProfile } from 'shared/types';
import {
  KanbanProvider,
  KanbanBoard,
  KanbanCard,
  KanbanCards,
  KanbanHeader,
  type DropResult,
} from '@vibe/ui/components/KanbanBoard';
import { KanbanCardContent } from '@vibe/ui/components/KanbanCardContent';
import {
  IssueWorkspaceCard,
  type WorkspaceWithStats,
  type WorkspacePr,
} from '@vibe/ui/components/IssueWorkspaceCard';
import { resolveRelationshipsForIssue } from '@/shared/lib/resolveRelationships';
import { KanbanFilterBar } from '@vibe/ui/components/KanbanFilterBar';
import { ViewNavTabs } from '@vibe/ui/components/ViewNavTabs';
import { IssueListView } from '@vibe/ui/components/IssueListView';
import { CommandBarDialog } from '@/shared/dialogs/command-bar/CommandBarDialog';
import { KanbanFiltersDialog } from '@/shared/dialogs/kanban/KanbanFiltersDialog';
import { SearchableTagDropdownContainer } from '@/shared/components/SearchableTagDropdownContainer';
import type { IssuePriority } from 'shared/remote-types';
import { useIssueMultiSelect } from '@/shared/hooks/useIssueMultiSelect';
import { useIssueSelectionStore } from '@/shared/stores/useIssueSelectionStore';
import { BulkActionBarContainer } from './BulkActionBarContainer';
import { saveProjectStatusDefaults } from '@/shared/hooks/useProjectRepoDefaults';
import { projectsApi } from '@/shared/lib/api';

const areStringSetsEqual = (left: string[], right: string[]): boolean => {
  if (left.length !== right.length) {
    return false;
  }

  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
};

const areKanbanFiltersEqual = (
  left: KanbanFilterState,
  right: KanbanFilterState
): boolean => {
  if (left.searchQuery.trim() !== right.searchQuery.trim()) {
    return false;
  }

  if (!areStringSetsEqual(left.priorities, right.priorities)) {
    return false;
  }

  if (!areStringSetsEqual(left.assigneeIds, right.assigneeIds)) {
    return false;
  }

  if (!areStringSetsEqual(left.tagIds, right.tagIds)) {
    return false;
  }

  return (
    left.sortField === right.sortField &&
    left.sortDirection === right.sortDirection
  );
};

function LoadingState() {
  const { t } = useTranslation('common');
  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-low">{t('states.loading')}</p>
    </div>
  );
}

function useDismissableLayer(
  isOpen: boolean,
  refs: RefObject<HTMLElement>[],
  onDismiss: () => void
) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      const inside = refs.some((ref) => ref.current?.contains(target));
      if (!inside) {
        onDismiss();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onDismiss();
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onDismiss, refs]);
}

type LocalProjectSettingsDialogProps = {
  projectId: string;
  projectName: string;
  statuses: {
    id: string;
    name: string;
    color: string;
    hidden?: boolean;
    sort_order?: number;
  }[];
  issues: { id: string; status_id: string }[];
  onClose: () => void;
};

function normalizeLocalStatusKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function defaultLocalStatusColor(name: string) {
  switch (normalizeLocalStatusKey(name)) {
    case 'inprogress':
      return '42 90% 55%';
    case 'inreview':
      return '280 55% 58%';
    case 'instaging':
      return '196 72% 47%';
    case 'done':
    case 'completed':
      return '145 55% 42%';
    case 'cancelled':
    case 'canceled':
      return '0 0% 55%';
    default:
      return '220 70% 52%';
  }
}

function buildLocalStatusId(name: string) {
  const normalized = normalizeLocalStatusKey(name);
  if (!normalized || normalized === 'todo') {
    return 'todo';
  }
  if (normalized === 'inprogress') {
    return 'in_progress';
  }
  if (normalized === 'inreview') {
    return 'in_review';
  }
  if (normalized === 'instaging') {
    return 'in_staging';
  }
  if (normalized === 'done' || normalized === 'completed') {
    return 'done';
  }
  if (normalized === 'cancelled' || normalized === 'canceled') {
    return 'cancelled';
  }
  return `status_${normalized}`;
}

function LocalProjectSettingsDialog({
  projectId,
  projectName,
  statuses,
  issues,
  onClose,
}: LocalProjectSettingsDialogProps) {
  const queryClient = useQueryClient();
  const appNavigation = useAppNavigation();
  const countsByStatusId = useMemo(() => {
    const counts = new Map<string, number>();
    issues.forEach((issue) => {
      counts.set(issue.status_id, (counts.get(issue.status_id) ?? 0) + 1);
    });
    return counts;
  }, [issues]);

  const [draftStatuses, setDraftStatuses] = useState(() =>
    [...statuses]
      .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
      .map((status, index) => ({
        id: status.id,
        name: status.name,
        color: status.color,
        hidden: status.hidden ?? false,
        sort_order: status.sort_order ?? index,
      }))
  );
  const [newColumnName, setNewColumnName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statusCounts = useMemo(
    () =>
      draftStatuses.map((status) => ({
        ...status,
        count: countsByStatusId.get(status.id) ?? 0,
      })),
    [countsByStatusId, draftStatuses]
  );

  const moveStatus = useCallback((index: number, direction: -1 | 1) => {
    setDraftStatuses((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next.map((status, sortOrder) => ({
        ...status,
        sort_order: sortOrder,
      }));
    });
  }, []);

  const removeStatus = useCallback((id: string) => {
    setDraftStatuses((current) =>
      current
        .filter((status) => status.id !== id)
        .map((status, sortOrder) => ({
          ...status,
          sort_order: sortOrder,
        }))
    );
  }, []);

  const addStatus = useCallback(() => {
    const trimmed = newColumnName.trim();
    if (!trimmed) {
      return;
    }
    const key = normalizeLocalStatusKey(trimmed);
    if (!key) {
      return;
    }
    if (
      draftStatuses.some(
        (status) => normalizeLocalStatusKey(status.name) === key
      )
    ) {
      setError('That column already exists.');
      return;
    }
    setError(null);
    setDraftStatuses((current) => [
      ...current,
      {
        id: buildLocalStatusId(trimmed),
        name: trimmed,
        color: defaultLocalStatusColor(trimmed),
        hidden: false,
        sort_order: current.length,
      },
    ]);
    setNewColumnName('');
  }, [draftStatuses, newColumnName]);

  const saveStatuses = useCallback(async () => {
    try {
      setIsSaving(true);
      setError(null);
      await saveProjectStatusDefaults(
        projectId,
        draftStatuses.map((status, index) => ({
          id: status.id,
          name: status.name,
          color: status.color,
          hidden: status.hidden,
          sort_order: index,
        }))
      );
      onClose();
      window.location.reload();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Failed to save project settings.'
      );
    } finally {
      setIsSaving(false);
    }
  }, [draftStatuses, onClose, projectId]);

  const archiveProject = useCallback(async () => {
    try {
      setIsSaving(true);
      setError(null);
      await projectsApi.update(projectId, { archived: true });
      await queryClient.invalidateQueries({ queryKey: ['local-projects'] });
      await queryClient.invalidateQueries({
        queryKey: ['local-project', projectId],
      });
      onClose();
      appNavigation.goToWorkspaces();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Failed to archive project.'
      );
    } finally {
      setIsSaving(false);
    }
  }, [appNavigation, onClose, projectId, queryClient]);

  return (
    <>
      <div className="fixed inset-0 z-[10000] bg-black/50" onClick={onClose} />
      <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
        <div
          className="w-full max-w-3xl overflow-hidden rounded-sm border border-border bg-panel shadow-lg"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h3 className="text-lg font-medium text-high">
                Project settings
              </h3>
              <p className="text-sm text-low">{projectName}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm p-1 text-low transition-colors hover:bg-secondary hover:text-normal"
              aria-label="Close project settings"
            >
              <XIcon className="size-icon-sm" weight="bold" />
            </button>
          </div>
          <div className="space-y-4 px-4 py-4">
            <div className="rounded-sm border border-border bg-secondary/40 px-3 py-2 text-sm text-low">
              Local-only boards keep their columns in local project scratch now.
              Add, move, and remove empty columns here. Removing a column with
              issues is blocked.
            </div>
            <div className="flex items-center justify-between gap-4 rounded-sm border border-border bg-panel px-3 py-2">
              <div>
                <div className="text-sm font-medium text-high">
                  Archive project
                </div>
                <div className="text-xs text-low">
                  Hide this project from the main sidebar until it is restored
                  from Archived.
                </div>
              </div>
              <button
                type="button"
                onClick={() => void archiveProject()}
                disabled={isSaving}
                className="rounded-sm border border-border px-3 py-2 text-sm text-high transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
              >
                Archive
              </button>
            </div>
            <div className="flex gap-2">
              <input
                value={newColumnName}
                onChange={(event) => {
                  setError(null);
                  setNewColumnName(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addStatus();
                  }
                }}
                placeholder="New column name"
                className="flex-1 rounded-sm border border-border bg-panel px-3 py-2 text-sm text-high outline-none ring-0 placeholder:text-low focus:border-brand"
              />
              <button
                type="button"
                onClick={addStatus}
                className="rounded-sm border border-border px-3 py-2 text-sm text-high transition-colors hover:bg-secondary"
              >
                Add column
              </button>
            </div>
            {error && (
              <div className="rounded-sm border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <div className="text-sm font-medium text-high">Columns</div>
              <div className="space-y-2">
                {statusCounts.map((status, index) => {
                  const canRemove = status.count === 0;
                  return (
                    <div
                      key={status.id}
                      className="flex items-center justify-between gap-3 rounded-sm border border-border px-3 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: `hsl(${status.color})` }}
                        />
                        <div className="min-w-0">
                          <div className="truncate text-sm text-high">
                            {status.name}
                          </div>
                          <div className="text-xs text-low">
                            {status.count} issues
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => moveStatus(index, -1)}
                          disabled={index === 0}
                          className="rounded-sm border border-border px-2 py-1 text-xs text-high transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          onClick={() => moveStatus(index, 1)}
                          disabled={index === statusCounts.length - 1}
                          className="rounded-sm border border-border px-2 py-1 text-xs text-high transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Down
                        </button>
                        <button
                          type="button"
                          onClick={() => removeStatus(status.id)}
                          disabled={!canRemove}
                          className="rounded-sm border border-border px-2 py-1 text-xs text-high transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
                          title={
                            canRemove
                              ? 'Remove column'
                              : 'Move issues out of this column before removing it'
                          }
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm border border-border px-3 py-2 text-sm text-high transition-colors hover:bg-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void saveStatuses()}
              disabled={isSaving}
              className="rounded-sm bg-brand px-3 py-2 text-sm font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? 'Saving…' : 'Save columns'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

type CollapsedKanbanColumnProps = {
  statusName: string;
  statusColor: string;
  onExpand: () => void;
  isMobile: boolean;
};

function CollapsedKanbanColumn({
  statusName,
  statusColor,
  onExpand,
  isMobile,
}: CollapsedKanbanColumnProps) {
  const { t } = useTranslation('common');

  return (
    <button
      type="button"
      onClick={onExpand}
      className="group relative flex min-h-40 flex-1 overflow-hidden bg-secondary transition-colors hover:bg-secondary/80 focus:outline-none focus:ring-1 focus:ring-brand"
      aria-label={t('kanban.expandColumn', {
        defaultValue: 'Expand {{statusName}} column',
        statusName,
      })}
      title={statusName}
    >
      <div
        className={cn(
          'sticky top-0 z-20 flex w-full shrink-0 border-b bg-secondary/95 px-2 backdrop-blur-sm',
          isMobile
            ? 'items-center justify-start py-3'
            : 'h-40 items-start justify-center pt-4'
        )}
      >
        <div
          className={cn(
            'flex items-center gap-2 whitespace-nowrap text-center',
            isMobile
              ? '[writing-mode:horizontal-tb]'
              : '[writing-mode:vertical-rl] pt-2'
          )}
        >
          <span className="text-sm font-medium leading-none text-normal">
            &gt;
          </span>
          <div
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: `hsl(${statusColor})` }}
          />
          <span className="text-sm font-medium leading-none text-normal">
            {statusName}
          </span>
        </div>
      </div>
    </button>
  );
}

/**
 * KanbanContainer displays the kanban board using data from ProjectContext and OrgContext.
 * Must be rendered within both OrgProvider and ProjectProvider.
 */
export function KanbanContainer() {
  const isMobile = useIsMobile();
  const { t } = useTranslation('common');
  const appNavigation = useAppNavigation();
  const routeState = useCurrentKanbanRouteState();

  // Get data from contexts (set up by WorkspacesLayout)
  const {
    projectId,
    issues,
    statuses,
    tags,
    issueAssignees,
    issueTags,
    issueRelationships,
    getTagObjectsForIssue,
    getTagsForIssue,
    getPullRequestsForIssue,
    getWorkspacesForIssue,
    getRelationshipsForIssue,
    issuesById,
    insertIssueTag,
    removeIssueTag,
    insertTag,
    pullRequests,
    isLoading: projectLoading,
  } = useProjectContext();

  const {
    projects,
    membersWithProfilesById,
    isLoading: orgLoading,
  } = useOrgContext();
  const { activeWorkspaces } = useWorkspaceContext();
  const { userId } = useAuth();
  const { loginStatus } = useUserSystem();
  const isLocalOnlySession =
    loginStatus?.status === 'loggedin' && !loginStatus.profile;

  // Get project name by finding the project matching current projectId
  const projectName = projects.find((p) => p.id === projectId)?.name ?? '';

  const selectedKanbanIssueId = routeState.issueId;
  const issueComposerKey = useMemo(
    () => buildKanbanIssueComposerKey(routeState.hostId, projectId),
    [routeState.hostId, projectId]
  );
  const issueComposer = useKanbanIssueComposer(issueComposerKey);
  const isIssueComposerOpen = issueComposer !== null;
  const openIssue = useCallback(
    (issueId: string) => {
      if (isIssueComposerOpen) {
        closeKanbanIssueComposer(issueComposerKey);
      }

      appNavigation.goToProjectIssue(projectId, issueId);
    },
    [isIssueComposerOpen, issueComposerKey, appNavigation, projectId]
  );
  const openIssueWorkspace = useCallback(
    (issueId: string, workspaceAttemptId: string) => {
      appNavigation.goToProjectIssueWorkspace(
        projectId,
        issueId,
        workspaceAttemptId
      );
    },
    [appNavigation, projectId]
  );
  const startCreate = useCallback(
    (options?: ProjectIssueCreateOptions) => {
      openKanbanIssueComposer(issueComposerKey, options);
    },
    [issueComposerKey]
  );

  // Get setter and executor from ActionsContext
  const {
    setDefaultCreateStatusId,
    executeAction,
    openPrioritySelection,
    openAssigneeSelection,
  } = useActions();
  const openProjectsGuide = useCallback(() => {
    executeAction(Actions.ProjectsGuide);
  }, [executeAction]);

  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const [isLocalProjectSettingsOpen, setIsLocalProjectSettingsOpen] =
    useState(false);
  const projectMenuButtonRef = useRef<HTMLButtonElement>(null);
  const projectMenuRef = useRef<HTMLDivElement>(null);

  useDismissableLayer(
    isProjectMenuOpen,
    [projectMenuButtonRef, projectMenuRef],
    () => setIsProjectMenuOpen(false)
  );

  const projectViewSelection = useUiPreferencesStore(
    (s) => s.kanbanProjectViewSelections[projectId]
  );
  const projectViewPreferencesById = useUiPreferencesStore(
    (s) => s.kanbanProjectViewPreferences[projectId]
  );
  const setKanbanProjectView = useUiPreferencesStore(
    (s) => s.setKanbanProjectView
  );
  const setKanbanProjectViewFilters = useUiPreferencesStore(
    (s) => s.setKanbanProjectViewFilters
  );
  const setKanbanProjectViewShowSubIssues = useUiPreferencesStore(
    (s) => s.setKanbanProjectViewShowSubIssues
  );
  const setKanbanProjectViewShowWorkspaces = useUiPreferencesStore(
    (s) => s.setKanbanProjectViewShowWorkspaces
  );
  const setKanbanProjectViewHideBlocked = useUiPreferencesStore(
    (s) => s.setKanbanProjectViewHideBlocked
  );
  const setKanbanProjectViewCollapsedStatusIds = useUiPreferencesStore(
    (s) => s.setKanbanProjectViewCollapsedStatusIds
  );
  const clearKanbanProjectViewPreferences = useUiPreferencesStore(
    (s) => s.clearKanbanProjectViewPreferences
  );
  const resolvedProjectState = useMemo(
    () => resolveKanbanProjectState(projectViewSelection),
    [projectViewSelection]
  );
  const {
    activeViewId,
    filters: defaultKanbanFilters,
    showSubIssues: defaultShowSubIssues,
    showWorkspaces: defaultShowWorkspaces,
    hideBlocked: defaultHideBlocked,
    collapsedStatusIds: defaultCollapsedStatusIds,
  } = resolvedProjectState;
  const projectViewPreferences = projectViewPreferencesById?.[activeViewId];
  const kanbanFilters = projectViewPreferences?.filters ?? defaultKanbanFilters;
  const showSubIssues =
    projectViewPreferences?.showSubIssues ?? defaultShowSubIssues;
  const showWorkspaces =
    projectViewPreferences?.showWorkspaces ?? defaultShowWorkspaces;
  const hideBlocked = projectViewPreferences?.hideBlocked ?? defaultHideBlocked;
  const collapsedStatusIds =
    projectViewPreferences?.collapsedStatusIds ?? defaultCollapsedStatusIds;
  const collapsedStatusIdSet = useMemo(
    () => new Set(collapsedStatusIds),
    [collapsedStatusIds]
  );

  const hasActiveFilters = useMemo(
    () =>
      !areKanbanFiltersEqual(kanbanFilters, defaultKanbanFilters) ||
      showSubIssues !== defaultShowSubIssues ||
      showWorkspaces !== defaultShowWorkspaces ||
      hideBlocked !== defaultHideBlocked,
    [
      kanbanFilters,
      defaultKanbanFilters,
      showSubIssues,
      defaultShowSubIssues,
      showWorkspaces,
      defaultShowWorkspaces,
      hideBlocked,
      defaultHideBlocked,
    ]
  );
  const shouldAnimateCreateButton = issues.length === 0;

  // Compute resolved status IDs for the blocked filter.
  // A blocking issue is considered resolved when it's in:
  // - The last visible status (rightmost kanban column, e.g. "Done")
  // - Any hidden status (terminal states like "Cancelled" that don't appear as columns)
  const doneStatusIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of statuses) {
      if (s.hidden) ids.add(s.id);
    }
    const sorted = statuses
      .filter((s) => !s.hidden)
      .sort((a, b) => a.sort_order - b.sort_order);
    const lastVisible = sorted[sorted.length - 1];
    if (lastVisible) ids.add(lastVisible.id);
    return ids;
  }, [statuses]);

  const { filteredIssues } = useKanbanFilters({
    issues,
    issueAssignees,
    issueTags,
    issueRelationships,
    issuesById,
    doneStatusIds,
    filters: kanbanFilters,
    showSubIssues,
    hideBlocked,
    currentUserId: userId,
  });

  const setKanbanSearchQuery = useCallback(
    (searchQuery: string) => {
      setKanbanProjectViewFilters(projectId, activeViewId, {
        ...kanbanFilters,
        searchQuery,
      });
    },
    [activeViewId, kanbanFilters, projectId, setKanbanProjectViewFilters]
  );

  const setKanbanPriorities = useCallback(
    (priorities: IssuePriority[]) => {
      setKanbanProjectViewFilters(projectId, activeViewId, {
        ...kanbanFilters,
        priorities,
      });
    },
    [activeViewId, kanbanFilters, projectId, setKanbanProjectViewFilters]
  );

  const setKanbanAssignees = useCallback(
    (assigneeIds: string[]) => {
      setKanbanProjectViewFilters(projectId, activeViewId, {
        ...kanbanFilters,
        assigneeIds,
      });
    },
    [activeViewId, kanbanFilters, projectId, setKanbanProjectViewFilters]
  );

  const setKanbanTags = useCallback(
    (tagIds: string[]) => {
      setKanbanProjectViewFilters(projectId, activeViewId, {
        ...kanbanFilters,
        tagIds,
      });
    },
    [activeViewId, kanbanFilters, projectId, setKanbanProjectViewFilters]
  );

  const setKanbanSort = useCallback(
    (sortField: KanbanSortField, sortDirection: 'asc' | 'desc') => {
      setKanbanProjectViewFilters(projectId, activeViewId, {
        ...kanbanFilters,
        sortField,
        sortDirection,
      });
    },
    [activeViewId, kanbanFilters, projectId, setKanbanProjectViewFilters]
  );

  const setShowSubIssues = useCallback(
    (show: boolean) => {
      setKanbanProjectViewShowSubIssues(projectId, activeViewId, show);
    },
    [activeViewId, projectId, setKanbanProjectViewShowSubIssues]
  );

  const setShowWorkspaces = useCallback(
    (show: boolean) => {
      setKanbanProjectViewShowWorkspaces(projectId, activeViewId, show);
    },
    [activeViewId, projectId, setKanbanProjectViewShowWorkspaces]
  );

  const setHideBlocked = useCallback(
    (hide: boolean) => {
      setKanbanProjectViewHideBlocked(projectId, activeViewId, hide);
    },
    [activeViewId, projectId, setKanbanProjectViewHideBlocked]
  );

  const clearKanbanFilters = useCallback(() => {
    clearKanbanProjectViewPreferences(projectId, activeViewId);
  }, [activeViewId, clearKanbanProjectViewPreferences, projectId]);

  const toggleCollapsedStatus = useCallback(
    (statusId: string) => {
      const nextCollapsedStatusIds = collapsedStatusIdSet.has(statusId)
        ? collapsedStatusIds.filter((id) => id !== statusId)
        : [...collapsedStatusIds, statusId];

      setKanbanProjectViewCollapsedStatusIds(
        projectId,
        activeViewId,
        nextCollapsedStatusIds
      );
    },
    [
      activeViewId,
      collapsedStatusIdSet,
      collapsedStatusIds,
      projectId,
      setKanbanProjectViewCollapsedStatusIds,
    ]
  );

  const handleKanbanProjectViewChange = useCallback(
    (viewId: string) => {
      setKanbanProjectView(projectId, viewId);
    },
    [projectId, setKanbanProjectView]
  );
  const kanbanViewMode = useUiPreferencesStore((s) => s.kanbanViewMode);
  const listViewStatusFilter = useUiPreferencesStore(
    (s) => s.listViewStatusFilter
  );
  const setKanbanViewMode = useUiPreferencesStore((s) => s.setKanbanViewMode);
  const setListViewStatusFilter = useUiPreferencesStore(
    (s) => s.setListViewStatusFilter
  );
  // Reset view mode when navigating projects
  const prevProjectIdRef = useRef<string | null>(null);

  // Track when drag-drop sync is in progress to prevent flicker
  const isSyncingRef = useRef(false);

  useEffect(() => {
    if (
      prevProjectIdRef.current !== null &&
      prevProjectIdRef.current !== projectId
    ) {
      setKanbanViewMode('kanban');
      setListViewStatusFilter(null);
    }

    prevProjectIdRef.current = projectId;
  }, [projectId, setKanbanViewMode, setListViewStatusFilter]);

  // Sort all statuses for display settings
  const sortedStatuses = useMemo(
    () => [...statuses].sort((a, b) => a.sort_order - b.sort_order),
    [statuses]
  );

  // Filter statuses: visible (non-hidden) for kanban, hidden for tabs
  const visibleStatuses = useMemo(
    () => sortedStatuses.filter((s) => !s.hidden),
    [sortedStatuses]
  );
  const kanbanGridTemplateColumns = useMemo(
    () =>
      visibleStatuses
        .map((status) =>
          collapsedStatusIdSet.has(status.id) ? '4rem' : 'minmax(200px, 1fr)'
        )
        .join(' '),
    [collapsedStatusIdSet, visibleStatuses]
  );

  // Map status ID to 1-based column index for sort_order calculation
  const statusColumnIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    visibleStatuses.forEach((status, index) => {
      map.set(status.id, index + 1);
    });
    return map;
  }, [visibleStatuses]);

  const hiddenStatuses = useMemo(
    () => sortedStatuses.filter((s) => s.hidden),
    [sortedStatuses]
  );

  const defaultCreateStatusId = useMemo(() => {
    if (kanbanViewMode === 'kanban') {
      return visibleStatuses[0]?.id;
    }
    if (listViewStatusFilter) {
      return listViewStatusFilter;
    }
    return sortedStatuses[0]?.id;
  }, [kanbanViewMode, visibleStatuses, listViewStatusFilter, sortedStatuses]);

  // Update default create status for command bar based on current tab
  useEffect(() => {
    setDefaultCreateStatusId(defaultCreateStatusId);
  }, [defaultCreateStatusId, setDefaultCreateStatusId]);

  const createAssigneeIds = useMemo(() => {
    const assigneeIds = new Set<string>();

    for (const assigneeId of kanbanFilters.assigneeIds) {
      if (assigneeId === KANBAN_ASSIGNEE_FILTER_VALUES.UNASSIGNED) {
        continue;
      }

      if (assigneeId === KANBAN_ASSIGNEE_FILTER_VALUES.SELF) {
        if (userId) {
          assigneeIds.add(userId);
        }
        continue;
      }

      assigneeIds.add(assigneeId);
    }

    return [...assigneeIds];
  }, [kanbanFilters.assigneeIds, userId]);

  // Get statuses to display in list view (all or filtered to one)
  const listViewStatuses = useMemo(() => {
    if (listViewStatusFilter) {
      return sortedStatuses.filter((s) => s.id === listViewStatusFilter);
    }
    return sortedStatuses;
  }, [sortedStatuses, listViewStatusFilter]);

  // Track items as arrays of IDs grouped by status
  const [items, setItems] = useState<Record<string, string[]>>({});
  const [isFiltersDialogOpen, setIsFiltersDialogOpen] = useState(false);

  // Sync items from filtered issues when they change
  useEffect(() => {
    // Skip rebuild during drag-drop sync to prevent flicker
    if (isSyncingRef.current) {
      return;
    }

    const { sortField, sortDirection } = kanbanFilters;
    const grouped: Record<string, string[]> = {};

    for (const status of statuses) {
      // Filter issues for this status
      let statusIssues = filteredIssues.filter(
        (i) => i.status_id === status.id
      );

      // Sort within column based on user preference
      statusIssues = [...statusIssues].sort((a, b) => {
        let comparison = 0;
        switch (sortField) {
          case 'priority':
            comparison =
              (a.priority ? PRIORITY_ORDER[a.priority] : Infinity) -
              (b.priority ? PRIORITY_ORDER[b.priority] : Infinity);
            break;
          case 'created_at':
            comparison =
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime();
            break;
          case 'updated_at':
            comparison =
              new Date(a.updated_at).getTime() -
              new Date(b.updated_at).getTime();
            break;
          case 'title':
            comparison = a.title.localeCompare(b.title);
            break;
          case 'sort_order':
          default:
            comparison = a.sort_order - b.sort_order;
        }
        return sortDirection === 'desc' ? -comparison : comparison;
      });

      grouped[status.id] = statusIssues.map((i) => i.id);
    }
    setItems(grouped);
  }, [filteredIssues, statuses, kanbanFilters]);

  // Create a lookup map for issue data
  const issueMap = useMemo(() => {
    const map: Record<string, (typeof issues)[0]> = {};
    for (const issue of issues) {
      map[issue.id] = issue;
    }
    return map;
  }, [issues]);

  // Create a lookup map for issue assignees (issue_id -> OrganizationMemberWithProfile[])
  const issueAssigneesMap = useMemo(() => {
    const map: Record<string, OrganizationMemberWithProfile[]> = {};
    for (const assignee of issueAssignees) {
      const member = membersWithProfilesById.get(assignee.user_id);
      if (member) {
        if (!map[assignee.issue_id]) {
          map[assignee.issue_id] = [];
        }
        map[assignee.issue_id].push(member);
      }
    }
    return map;
  }, [issueAssignees, membersWithProfilesById]);

  const membersWithProfiles = useMemo(
    () => [...membersWithProfilesById.values()],
    [membersWithProfilesById]
  );

  const localWorkspacesById = useMemo(() => {
    const map = new Map<string, (typeof activeWorkspaces)[number]>();

    for (const workspace of activeWorkspaces) {
      map.set(workspace.id, workspace);
    }

    return map;
  }, [activeWorkspaces]);

  const prsByWorkspaceId = useMemo(() => {
    const map = new Map<string, WorkspacePr[]>();

    for (const pr of pullRequests) {
      if (!pr.workspace_id) continue;

      const prs = map.get(pr.workspace_id) ?? [];
      prs.push({
        number: pr.number,
        url: pr.url,
        status: pr.status as 'open' | 'merged' | 'closed',
      });
      map.set(pr.workspace_id, prs);
    }

    return map;
  }, [pullRequests]);

  const workspacesByIssueId = useMemo(() => {
    if (!showWorkspaces) {
      return new Map<string, WorkspaceWithStats[]>();
    }

    const map = new Map<string, WorkspaceWithStats[]>();

    for (const issue of issues) {
      const nonArchivedWorkspaces = getWorkspacesForIssue(issue.id)
        .filter(
          (workspace) =>
            !workspace.archived &&
            !!workspace.local_workspace_id &&
            localWorkspacesById.has(workspace.local_workspace_id)
        )
        .map((workspace) => {
          const localWorkspace = localWorkspacesById.get(
            workspace.local_workspace_id!
          );

          return {
            id: workspace.id,
            localWorkspaceId: workspace.local_workspace_id,
            name: workspace.name,
            archived: workspace.archived,
            filesChanged: workspace.files_changed ?? 0,
            linesAdded: workspace.lines_added ?? 0,
            linesRemoved: workspace.lines_removed ?? 0,
            prs: prsByWorkspaceId.get(workspace.id) ?? [],
            owner: membersWithProfilesById.get(workspace.owner_user_id) ?? null,
            updatedAt: workspace.updated_at,
            isOwnedByCurrentUser: workspace.owner_user_id === userId,
            isRunning: localWorkspace?.isRunning,
            hasPendingApproval: localWorkspace?.hasPendingApproval,
            hasRunningDevServer: localWorkspace?.hasRunningDevServer,
            hasUnseenActivity: localWorkspace?.hasUnseenActivity,
            latestProcessCompletedAt: localWorkspace?.latestProcessCompletedAt,
            latestProcessStatus: localWorkspace?.latestProcessStatus,
          };
        });

      if (nonArchivedWorkspaces.length > 0) {
        map.set(issue.id, nonArchivedWorkspaces);
      }
    }

    return map;
  }, [
    showWorkspaces,
    issues,
    getWorkspacesForIssue,
    localWorkspacesById,
    prsByWorkspaceId,
    membersWithProfilesById,
    userId,
  ]);

  // Calculate sort_order based on column index and issue position
  // Formula: 1000 * [COLUMN_INDEX] + [ISSUE_INDEX] (both 1-based)
  const calculateSortOrder = useCallback(
    (statusId: string, issueIndex: number): number => {
      const columnIndex = statusColumnIndexMap.get(statusId) ?? 1;
      return 1000 * columnIndex + (issueIndex + 1);
    },
    [statusColumnIndexMap]
  );

  // Simple onDragEnd handler - the library handles all visual movement
  const handleDragEnd = useCallback(
    (result: DropResult) => {
      const { source, destination } = result;

      // Dropped outside a valid droppable
      if (!destination) return;

      // No movement
      if (
        source.droppableId === destination.droppableId &&
        source.index === destination.index
      ) {
        return;
      }

      const isManualSort = kanbanFilters.sortField === 'sort_order';

      // Block within-column reordering when not in manual sort mode
      // (cross-column moves are always allowed for status changes)
      if (source.droppableId === destination.droppableId && !isManualSort) {
        return;
      }

      const sourceId = source.droppableId;
      const destId = destination.droppableId;
      const isCrossColumn = sourceId !== destId;

      // Update local state and capture new items for bulk update
      let newItems: Record<string, string[]> = {};
      setItems((prev) => {
        const sourceItems = [...(prev[sourceId] ?? [])];
        const [moved] = sourceItems.splice(source.index, 1);

        if (!isCrossColumn) {
          // Within-column reorder
          sourceItems.splice(destination.index, 0, moved);
          newItems = { ...prev, [sourceId]: sourceItems };
        } else {
          // Cross-column move
          const destItems = [...(prev[destId] ?? [])];
          destItems.splice(destination.index, 0, moved);
          newItems = {
            ...prev,
            [sourceId]: sourceItems,
            [destId]: destItems,
          };
        }
        return newItems;
      });

      // Build bulk updates for all issues in affected columns
      const updates: BulkUpdateIssueItem[] = [];

      // Always update destination column
      const destIssueIds = newItems[destId] ?? [];
      destIssueIds.forEach((issueId, index) => {
        updates.push({
          id: issueId,
          changes: {
            status_id: destId,
            sort_order: calculateSortOrder(destId, index),
          },
        });
      });

      // Update source column if cross-column move
      if (isCrossColumn) {
        const sourceIssueIds = newItems[sourceId] ?? [];
        sourceIssueIds.forEach((issueId, index) => {
          updates.push({
            id: issueId,
            changes: {
              sort_order: calculateSortOrder(sourceId, index),
            },
          });
        });
      }

      // Perform bulk update
      isSyncingRef.current = true;
      bulkUpdateIssues(updates)
        .catch((err) => {
          console.error('Failed to bulk update sort order:', err);
        })
        .finally(() => {
          // Delay clearing flag to let Electric sync complete
          setTimeout(() => {
            isSyncingRef.current = false;
          }, 500);
        });
    },
    [kanbanFilters.sortField, calculateSortOrder]
  );

  // Multi-select support
  const {
    selectedIssueIds,
    isMultiSelectActive,
    handleIssueClick,
    handleCheckboxChange,
    clearSelection,
  } = useIssueMultiSelect();
  const setOrderedIssueIds = useIssueSelectionStore(
    (s) => s.setOrderedIssueIds
  );
  const setAnchor = useIssueSelectionStore((s) => s.setAnchor);

  // Compute ordered issue IDs for range selection
  const orderedIssueIds = useMemo(() => {
    const statusOrder =
      kanbanViewMode === 'kanban' ? visibleStatuses : listViewStatuses;
    return statusOrder.flatMap((status) => items[status.id] ?? []);
  }, [kanbanViewMode, visibleStatuses, listViewStatuses, items]);

  // Keep the store's ordered IDs in sync
  useEffect(() => {
    setOrderedIssueIds(orderedIssueIds);
  }, [orderedIssueIds, setOrderedIssueIds]);

  // Clear multi-selection when project or view mode changes
  useEffect(() => {
    clearSelection();
  }, [projectId, kanbanViewMode, clearSelection]);

  // Keep anchor in sync with the currently opened issue (e.g. from URL on
  // page load) so Shift/Cmd+Click on another issue includes it.
  useEffect(() => {
    if (selectedKanbanIssueId) {
      setAnchor(selectedKanbanIssueId);
    }
  }, [selectedKanbanIssueId, setAnchor]);

  const handleCardClick = useCallback(
    (issueId: string, e?: MouseEvent) => {
      if (e && (e.metaKey || e.ctrlKey || e.shiftKey)) {
        handleIssueClick(issueId, e);
      } else {
        if (selectedIssueIds.size > 0) {
          clearSelection();
        }
        // Set as anchor so Shift+Click from this issue works
        setAnchor(issueId);
        openIssue(issueId);
      }
    },
    [
      openIssue,
      handleIssueClick,
      selectedIssueIds.size,
      clearSelection,
      setAnchor,
    ]
  );

  const handleAddTask = useCallback(
    (statusId?: string) => {
      const createPayload = {
        statusId: statusId ?? defaultCreateStatusId,
        ...(createAssigneeIds.length > 0
          ? { assigneeIds: createAssigneeIds }
          : {}),
      };
      startCreate(createPayload);
    },
    [createAssigneeIds, defaultCreateStatusId, startCreate]
  );

  // Inline editing callbacks for kanban cards
  // When multi-select is active, apply to all selected issues
  const handleCardPriorityClick = useCallback(
    (issueId: string) => {
      const ids = isMultiSelectActive ? [...selectedIssueIds] : [issueId];
      openPrioritySelection(projectId, ids);
    },
    [projectId, openPrioritySelection, selectedIssueIds, isMultiSelectActive]
  );

  const handleCardAssigneeClick = useCallback(
    (issueId: string) => {
      const ids = isMultiSelectActive ? [...selectedIssueIds] : [issueId];
      openAssigneeSelection(projectId, ids);
    },
    [projectId, openAssigneeSelection, selectedIssueIds, isMultiSelectActive]
  );

  const handleCardMoreActionsClick = useCallback(
    (issueId: string) => {
      const ids = isMultiSelectActive ? [...selectedIssueIds] : [issueId];
      CommandBarDialog.show({
        page: 'issueActions',
        projectId,
        issueIds: ids,
      });
    },
    [projectId, selectedIssueIds, isMultiSelectActive]
  );

  const handleCardTagToggle = useCallback(
    (issueId: string, tagId: string) => {
      const currentIssueTags = getTagsForIssue(issueId);
      const existing = currentIssueTags.find((it) => it.tag_id === tagId);
      if (existing) {
        removeIssueTag(existing.id);
      } else {
        insertIssueTag({ issue_id: issueId, tag_id: tagId });
      }
    },
    [getTagsForIssue, insertIssueTag, removeIssueTag]
  );

  const getResolvedRelationshipsForIssue = useCallback(
    (issueId: string) =>
      resolveRelationshipsForIssue(
        issueId,
        getRelationshipsForIssue(issueId),
        issuesById
      ),
    [getRelationshipsForIssue, issuesById]
  );

  const handleCreateTag = useCallback(
    (data: { name: string; color: string }): string => {
      const { data: newTag } = insertTag({
        project_id: projectId,
        name: data.name,
        color: data.color,
      });
      return newTag.id;
    },
    [insertTag, projectId]
  );

  const isLoading = projectLoading || orgLoading;

  if (isLoading) {
    return <LoadingState />;
  }

  return (
    <div className="flex flex-col h-full space-y-base">
      <div
        className={cn(
          'px-double pt-double space-y-base',
          isMobile && 'px-base pt-base'
        )}
      >
        <div className="flex items-center gap-half">
          <h2 className={cn('text-2xl font-medium', isMobile && 'text-lg')}>
            {projectName}
          </h2>

          <div className="relative">
            <button
              ref={projectMenuButtonRef}
              type="button"
              className="rounded-sm p-half text-low transition-colors hover:bg-secondary hover:text-normal"
              aria-label="Project menu"
              aria-expanded={isProjectMenuOpen}
              onClick={() => setIsProjectMenuOpen((value) => !value)}
            >
              <DotsThreeIcon className="size-icon-sm" weight="bold" />
            </button>
            {isProjectMenuOpen && (
              <div
                ref={projectMenuRef}
                className="absolute right-0 top-full z-[10000] mt-1 min-w-48 rounded-sm border border-border bg-panel py-half shadow-md"
              >
                <button
                  type="button"
                  className="flex w-full items-center px-base py-half text-left text-sm text-high transition-colors hover:bg-secondary"
                  onClick={() => {
                    setIsProjectMenuOpen(false);
                    openProjectsGuide();
                  }}
                >
                  {t('kanban.openProjectsGuide', 'Projects guide')}
                </button>
                <button
                  type="button"
                  className="flex w-full items-center px-base py-half text-left text-sm text-high transition-colors hover:bg-secondary"
                  onClick={() => {
                    setIsProjectMenuOpen(false);
                    if (isLocalOnlySession) {
                      setIsLocalProjectSettingsOpen(true);
                      return;
                    }
                    void executeAction(Actions.ProjectSettings);
                  }}
                >
                  {t('kanban.editProjectSettings', 'Edit project settings')}
                </button>
              </div>
            )}
          </div>
        </div>

        <div
          className={cn(
            'flex items-start gap-base',
            isMobile ? 'flex-col' : 'flex-wrap'
          )}
        >
          <ViewNavTabs
            activeView={kanbanViewMode}
            onViewChange={setKanbanViewMode}
            hiddenStatuses={hiddenStatuses}
            selectedStatusId={listViewStatusFilter}
            onStatusSelect={setListViewStatusFilter}
          />
          <KanbanFilterBar
            isFiltersDialogOpen={isFiltersDialogOpen}
            onFiltersDialogOpenChange={setIsFiltersDialogOpen}
            tags={tags}
            users={membersWithProfiles}
            activeViewId={activeViewId}
            onViewChange={handleKanbanProjectViewChange}
            viewIds={KANBAN_PROJECT_VIEW_IDS}
            projectId={projectId}
            currentUserId={userId}
            filters={kanbanFilters}
            showSubIssues={showSubIssues}
            showWorkspaces={showWorkspaces}
            hasActiveFilters={hasActiveFilters}
            onSearchQueryChange={setKanbanSearchQuery}
            onPrioritiesChange={setKanbanPriorities}
            onAssigneesChange={setKanbanAssignees}
            onTagsChange={setKanbanTags}
            onSortChange={setKanbanSort}
            onShowSubIssuesChange={setShowSubIssues}
            onShowWorkspacesChange={setShowWorkspaces}
            hideBlocked={hideBlocked}
            onHideBlockedChange={setHideBlocked}
            onClearFilters={clearKanbanFilters}
            onCreateIssue={handleAddTask}
            shouldAnimateCreateButton={shouldAnimateCreateButton}
            renderFiltersDialog={(props) => <KanbanFiltersDialog {...props} />}
            isMobile={isMobile}
          />
        </div>
      </div>

      {kanbanViewMode === 'kanban' ? (
        visibleStatuses.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-low">{t('kanban.noVisibleStatuses')}</p>
          </div>
        ) : (
          <div
            className={cn(
              'flex-1 overflow-x-auto px-double',
              isMobile && 'overflow-x-hidden px-base'
            )}
          >
            <KanbanProvider
              onDragEnd={handleDragEnd}
              className={cn(isMobile && '!grid-cols-1 !min-w-0 !w-full')}
              style={
                isMobile
                  ? undefined
                  : { gridTemplateColumns: kanbanGridTemplateColumns }
              }
            >
              {visibleStatuses.map((status) => {
                const issueIds = items[status.id] ?? [];
                const isCollapsed = collapsedStatusIdSet.has(status.id);

                return (
                  <KanbanBoard
                    key={status.id}
                    className={cn(
                      isCollapsed && !isMobile && '!min-w-16 !max-w-16'
                    )}
                  >
                    {isCollapsed ? (
                      <KanbanCards id={status.id} className="bg-secondary">
                        <CollapsedKanbanColumn
                          statusName={status.name}
                          statusColor={status.color}
                          onExpand={() => toggleCollapsedStatus(status.id)}
                          isMobile={isMobile}
                        />
                      </KanbanCards>
                    ) : (
                      <>
                        <KanbanHeader>
                          <div className="border-t sticky top-0 z-20 flex shrink-0 items-center justify-between gap-2 border-b bg-secondary p-base">
                            <div className="flex items-center gap-2 overflow-hidden">
                              <div
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{
                                  backgroundColor: `hsl(${status.color})`,
                                }}
                              />
                              <p className="m-0 truncate text-sm">
                                {status.name}
                              </p>
                            </div>
                            <div className="flex items-center gap-half">
                              <button
                                type="button"
                                onClick={() => toggleCollapsedStatus(status.id)}
                                className="rounded-sm p-half text-low transition-colors hover:bg-secondary hover:text-normal"
                                aria-label={t('kanban.collapseColumn', {
                                  defaultValue:
                                    'Collapse {{statusName}} column',
                                  statusName: status.name,
                                })}
                                title={t('kanban.collapseColumn', {
                                  defaultValue:
                                    'Collapse {{statusName}} column',
                                  statusName: status.name,
                                })}
                              >
                                <CaretLeftIcon
                                  className="size-icon-xs"
                                  weight="bold"
                                />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAddTask(status.id)}
                                className="rounded-sm p-half text-low transition-colors hover:bg-secondary hover:text-normal"
                                aria-label={t('kanban.addTask', 'Add task')}
                              >
                                <PlusIcon
                                  className="size-icon-xs"
                                  weight="bold"
                                />
                              </button>
                            </div>
                          </div>
                        </KanbanHeader>
                        <KanbanCards id={status.id}>
                          {issueIds.map((issueId, index) => {
                            const issue = issueMap[issueId];
                            if (!issue) return null;
                            const issueWorkspaces =
                              workspacesByIssueId.get(issue.id) ?? [];
                            const issueCardPullRequests =
                              getPullRequestsForIssue(issue.id);

                            return (
                              <KanbanCard
                                key={issue.id}
                                id={issue.id}
                                name={issue.title}
                                index={index}
                                className="group"
                                onClick={(e) => handleCardClick(issue.id, e)}
                                isOpen={selectedKanbanIssueId === issue.id}
                                isMobile={isMobile}
                                isSelected={selectedIssueIds.has(issue.id)}
                                dragDisabled={isMultiSelectActive}
                              >
                                <KanbanCardContent
                                  displayId={issue.simple_id}
                                  title={issue.title}
                                  description={issue.description}
                                  priority={issue.priority}
                                  tags={getTagObjectsForIssue(issue.id)}
                                  assignees={issueAssigneesMap[issue.id] ?? []}
                                  pullRequests={issueCardPullRequests}
                                  relationships={resolveRelationshipsForIssue(
                                    issue.id,
                                    getRelationshipsForIssue(issue.id),
                                    issuesById
                                  )}
                                  isSubIssue={!!issue.parent_issue_id}
                                  isMobile={isMobile}
                                  onPriorityClick={(e) => {
                                    e.stopPropagation();
                                    handleCardPriorityClick(issue.id);
                                  }}
                                  onAssigneeClick={(e) => {
                                    e.stopPropagation();
                                    handleCardAssigneeClick(issue.id);
                                  }}
                                  onMoreActionsClick={() =>
                                    handleCardMoreActionsClick(issue.id)
                                  }
                                  tagEditProps={{
                                    allTags: tags,
                                    selectedTagIds: getTagsForIssue(
                                      issue.id
                                    ).map((it) => it.tag_id),
                                    onTagToggle: (tagId) =>
                                      handleCardTagToggle(issue.id, tagId),
                                    onCreateTag: handleCreateTag,
                                    renderTagEditor: ({
                                      allTags,
                                      selectedTagIds,
                                      onTagToggle,
                                      onCreateTag,
                                      trigger,
                                    }) => (
                                      <SearchableTagDropdownContainer
                                        tags={allTags}
                                        selectedTagIds={selectedTagIds}
                                        onTagToggle={onTagToggle}
                                        onCreateTag={onCreateTag}
                                        disabled={false}
                                        contentClassName=""
                                        trigger={trigger}
                                      />
                                    ),
                                  }}
                                />
                                {issueWorkspaces.length > 0 && (
                                  <div className="mt-base flex flex-col gap-half">
                                    {issueWorkspaces.map((workspace) => (
                                      <IssueWorkspaceCard
                                        key={workspace.id}
                                        workspace={workspace}
                                        onClick={
                                          workspace.localWorkspaceId
                                            ? () =>
                                                openIssueWorkspace(
                                                  issue.id,
                                                  workspace.localWorkspaceId!
                                                )
                                            : undefined
                                        }
                                        showOwner={false}
                                        showStatusBadge={false}
                                        showNoPrText={false}
                                      />
                                    ))}
                                  </div>
                                )}
                              </KanbanCard>
                            );
                          })}
                        </KanbanCards>
                      </>
                    )}
                  </KanbanBoard>
                );
              })}
            </KanbanProvider>
          </div>
        )
      ) : (
        <div className="flex-1 overflow-y-auto px-double">
          <KanbanProvider onDragEnd={handleDragEnd} className="!block !w-full">
            <IssueListView
              statuses={listViewStatuses}
              items={items}
              issueMap={issueMap}
              issueAssigneesMap={issueAssigneesMap}
              getTagObjectsForIssue={getTagObjectsForIssue}
              getResolvedRelationshipsForIssue={
                getResolvedRelationshipsForIssue
              }
              onIssueClick={handleCardClick}
              selectedIssueId={selectedKanbanIssueId}
              selectedIssueIds={selectedIssueIds}
              isMultiSelectActive={isMultiSelectActive}
              onIssueCheckboxChange={handleCheckboxChange}
            />
          </KanbanProvider>
        </div>
      )}

      {isLocalProjectSettingsOpen && (
        <LocalProjectSettingsDialog
          projectId={projectId}
          projectName={projectName}
          statuses={statuses}
          issues={issues}
          onClose={() => setIsLocalProjectSettingsOpen(false)}
        />
      )}
      {isMultiSelectActive && <BulkActionBarContainer projectId={projectId} />}
    </div>
  );
}
