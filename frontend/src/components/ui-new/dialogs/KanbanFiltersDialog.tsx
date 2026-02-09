import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  UsersIcon,
  TagIcon,
  SortAscendingIcon,
  SortDescendingIcon,
  XIcon,
} from '@phosphor-icons/react';
import type { Tag, ProjectStatus } from 'shared/remote-types';
import type { OrganizationMemberWithProfile } from 'shared/types';
import { cn } from '@/lib/utils';
import {
  useUiPreferencesStore,
  KANBAN_ASSIGNEE_FILTER_VALUES,
  KANBAN_PROJECT_VIEW_IDS,
  resolveKanbanProjectState,
  type KanbanSortField,
} from '@/stores/useUiPreferencesStore';
import { useAuth } from '@/hooks/auth/useAuth';
import { UserAvatar } from '@/components/ui-new/primitives/UserAvatar';
import { KanbanAssignee } from '@/components/ui-new/primitives/KanbanAssignee';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { PrimaryButton } from '@/components/ui-new/primitives/PrimaryButton';
import {
  PropertyDropdown,
  type PropertyDropdownOption,
} from '@/components/ui-new/primitives/PropertyDropdown';
import {
  MultiSelectDropdown,
  type MultiSelectDropdownOption,
} from '@/components/ui-new/primitives/MultiSelectDropdown';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui-new/primitives/Dropdown';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui-new/primitives/Dialog';
import { AssigneeSelectionDialog } from '@/components/ui-new/dialogs/AssigneeSelectionDialog';
import { PriorityFilterDropdown } from '@/components/ui-new/views/PriorityFilterDropdown';
import { KanbanDisplaySettingsContainer } from '@/components/ui-new/containers/KanbanDisplaySettingsContainer';

interface KanbanFiltersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tags: Tag[];
  users: OrganizationMemberWithProfile[];
  hasActiveFilters: boolean;
  statuses: ProjectStatus[];
  projectId: string;
  issueCountByStatus: Record<string, number>;
  onInsertStatus: (data: {
    id: string;
    project_id: string;
    name: string;
    color: string;
    sort_order: number;
    hidden: boolean;
  }) => void;
  onUpdateStatus: (
    id: string,
    changes: {
      name?: string;
      color?: string;
      sort_order?: number;
      hidden?: boolean;
    }
  ) => void;
  onRemoveStatus: (id: string) => void;
}

const SORT_OPTIONS: PropertyDropdownOption<KanbanSortField>[] = [
  { value: 'sort_order', label: 'Manual' },
  { value: 'priority', label: 'Priority' },
  { value: 'created_at', label: 'Created' },
  { value: 'updated_at', label: 'Updated' },
  { value: 'title', label: 'Title' },
];

const DEFAULT_VIEW_OPTIONS: PropertyDropdownOption<string>[] = [
  { value: KANBAN_PROJECT_VIEW_IDS.TEAM, label: 'Team' },
  { value: KANBAN_PROJECT_VIEW_IDS.PERSONAL, label: 'Personal' },
];

export function KanbanFiltersDialog({
  open,
  onOpenChange,
  tags,
  users,
  hasActiveFilters,
  statuses,
  projectId,
  issueCountByStatus,
  onInsertStatus,
  onUpdateStatus,
  onRemoveStatus,
}: KanbanFiltersDialogProps) {
  const { t } = useTranslation('common');
  const { userId } = useAuth();

  const projectViewState = useUiPreferencesStore(
    (s) => s.kanbanProjectViewsByProject[projectId]
  );
  const setKanbanPriorities = useUiPreferencesStore(
    (s) => s.setKanbanPriorities
  );
  const setKanbanAssignees = useUiPreferencesStore((s) => s.setKanbanAssignees);
  const setKanbanTags = useUiPreferencesStore((s) => s.setKanbanTags);
  const setKanbanSort = useUiPreferencesStore((s) => s.setKanbanSort);
  const clearKanbanFilters = useUiPreferencesStore((s) => s.clearKanbanFilters);
  const applyKanbanView = useUiPreferencesStore((s) => s.applyKanbanView);
  const saveCurrentKanbanViewAsNew = useUiPreferencesStore(
    (s) => s.saveCurrentKanbanViewAsNew
  );
  const overwriteKanbanView = useUiPreferencesStore(
    (s) => s.overwriteKanbanView
  );
  const setShowSubIssues = useUiPreferencesStore((s) => s.setShowSubIssues);
  const setShowWorkspaces = useUiPreferencesStore((s) => s.setShowWorkspaces);

  const {
    activeViewId,
    filters: kanbanFilters,
    showSubIssues,
    showWorkspaces,
  } = useMemo(
    () => resolveKanbanProjectState(projectViewState),
    [projectViewState]
  );

  const viewOptions: PropertyDropdownOption<string>[] = useMemo(() => {
    if (!projectViewState || projectViewState.views.length === 0) {
      return DEFAULT_VIEW_OPTIONS;
    }

    return projectViewState.views.map((view) => ({
      value: view.id,
      label: view.name,
    }));
  }, [projectViewState]);

  const handleSaveAsNewView = () => {
    const name = window.prompt(
      t('kanban.saveViewPrompt', 'Enter a name for this view'),
      t('kanban.newView', 'New view')
    );
    if (!name) {
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }
    saveCurrentKanbanViewAsNew(projectId, trimmedName);
  };

  const handleOverwriteView = () => {
    overwriteKanbanView(projectId, activeViewId);
  };

  const handleApplyView = useCallback(
    (viewId: string) => {
      applyKanbanView(projectId, viewId);
    },
    [projectId, applyKanbanView]
  );

  const currentUser = useMemo(
    () => users.find((user) => user.user_id === userId) ?? null,
    [users, userId]
  );

  const assigneeDialogOptions = useMemo(
    () => [
      {
        value: KANBAN_ASSIGNEE_FILTER_VALUES.UNASSIGNED,
        label: t('kanban.unassigned', 'Unassigned'),
        renderOption: () => (
          <div className="flex items-center gap-base">
            <UsersIcon className="size-icon-xs text-low" weight="bold" />
            {t('kanban.unassigned', 'Unassigned')}
          </div>
        ),
      },
      {
        value: KANBAN_ASSIGNEE_FILTER_VALUES.SELF,
        label: t('kanban.self', 'Me'),
        renderOption: () => (
          <div className="flex items-center gap-base">
            {currentUser ? (
              <UserAvatar user={currentUser} className="h-4 w-4 text-[8px]" />
            ) : (
              <UsersIcon className="size-icon-xs text-low" weight="bold" />
            )}
            {t('kanban.self', 'Me')}
          </div>
        ),
      },
    ],
    [t, currentUser]
  );

  const tagOptions: MultiSelectDropdownOption<string>[] = useMemo(
    () =>
      tags.map((tag) => ({
        value: tag.id,
        label: tag.name,
        renderOption: () => (
          <div className="flex items-center gap-base">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: tag.color }}
            />
            {tag.name}
          </div>
        ),
      })),
    [tags]
  );

  const usersById = useMemo(() => {
    const map = new Map<string, OrganizationMemberWithProfile>();
    for (const user of users) {
      map.set(user.user_id, user);
    }
    return map;
  }, [users]);

  const renderAssigneeBadge = useMemo(
    () => (selectedIds: string[]) => {
      const resolved = selectedIds
        .filter((id) => id !== KANBAN_ASSIGNEE_FILTER_VALUES.UNASSIGNED)
        .map((id) => {
          if (id === KANBAN_ASSIGNEE_FILTER_VALUES.SELF) {
            return currentUser;
          }
          return usersById.get(id);
        })
        .filter((m): m is OrganizationMemberWithProfile => m != null);

      if (resolved.length === 0) {
        return (
          <Badge
            variant="secondary"
            className="px-1.5 py-0 text-xs h-5 min-w-5 justify-center bg-brand border-none"
          >
            {selectedIds.length}
          </Badge>
        );
      }

      return <KanbanAssignee assignees={resolved} />;
    },
    [usersById, currentUser]
  );

  const handleOpenAssigneeDialog = useCallback(() => {
    void AssigneeSelectionDialog.show({
      projectId,
      issueIds: [],
      isCreateMode: true,
      createModeAssigneeIds: kanbanFilters.assigneeIds,
      onCreateModeAssigneesChange: (assigneeIds: string[]) =>
        setKanbanAssignees(projectId, assigneeIds),
      additionalOptions: assigneeDialogOptions,
    });
  }, [
    projectId,
    kanbanFilters.assigneeIds,
    setKanbanAssignees,
    assigneeDialogOptions,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[920px] p-0">
        <div className="border-b border-border px-double pt-double pb-base">
          <DialogHeader className="space-y-half">
            <DialogTitle>
              {t('kanban.filtersAndViews', 'Filters & Views')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'kanban.filtersAndViewsDescription',
                'Edit project views and advanced kanban filters.'
              )}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="max-h-[72vh] overflow-y-auto px-double py-double">
          <div className="flex flex-col gap-double">
            <div className="space-y-base">
              <div className="text-xs uppercase tracking-wide text-low">
                {t('kanban.view', 'View')}
              </div>
              <div className="flex items-center gap-base flex-wrap">
                <PropertyDropdown
                  value={activeViewId}
                  options={viewOptions}
                  onChange={handleApplyView}
                  label={t('kanban.view', 'View')}
                />

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        'flex items-center gap-half bg-panel rounded-sm',
                        'text-sm text-normal hover:bg-secondary transition-colors',
                        'py-half px-base'
                      )}
                    >
                      {t('kanban.saveView', 'Save view')}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={handleSaveAsNewView}>
                      {t('kanban.saveAsNewView', 'Save as new view')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleOverwriteView}>
                      {t(
                        'kanban.overwriteCurrentView',
                        'Overwrite current view'
                      )}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-base">
              <div className="text-xs uppercase tracking-wide text-low">
                {t('kanban.filters', 'Filters')}
              </div>
              <div className="flex items-center gap-base flex-wrap">
                <PriorityFilterDropdown
                  values={kanbanFilters.priorities}
                  onChange={(priorities) =>
                    setKanbanPriorities(projectId, priorities)
                  }
                />

                <button
                  type="button"
                  onClick={handleOpenAssigneeDialog}
                  className={cn(
                    'flex items-center gap-half bg-panel rounded-sm',
                    'text-sm text-normal hover:bg-secondary transition-colors',
                    'py-half px-base'
                  )}
                >
                  <UsersIcon className="size-icon-xs" weight="bold" />
                  <span>{t('kanban.assignee', 'Assignee')}</span>
                  {kanbanFilters.assigneeIds.length > 0 &&
                    renderAssigneeBadge(kanbanFilters.assigneeIds)}
                </button>

                {tags.length > 0 && (
                  <MultiSelectDropdown
                    values={kanbanFilters.tagIds}
                    options={tagOptions}
                    onChange={(tagIds) => setKanbanTags(projectId, tagIds)}
                    icon={TagIcon}
                    label={t('kanban.tags', 'Tags')}
                    menuLabel={t('kanban.filterByTag', 'Filter by tag')}
                  />
                )}

                <PropertyDropdown
                  value={kanbanFilters.sortField}
                  options={SORT_OPTIONS}
                  onChange={(field: KanbanSortField) =>
                    setKanbanSort(projectId, field, kanbanFilters.sortDirection)
                  }
                  icon={
                    kanbanFilters.sortDirection === 'asc'
                      ? SortAscendingIcon
                      : SortDescendingIcon
                  }
                  label={t('kanban.sortBy', 'Sort')}
                />

                <button
                  type="button"
                  onClick={() => {
                    const newDirection =
                      kanbanFilters.sortDirection === 'asc' ? 'desc' : 'asc';
                    setKanbanSort(
                      projectId,
                      kanbanFilters.sortField,
                      newDirection
                    );
                  }}
                  className={cn(
                    'flex items-center justify-center p-half rounded-sm',
                    'text-normal hover:bg-secondary transition-colors'
                  )}
                  title={
                    kanbanFilters.sortDirection === 'asc'
                      ? t('kanban.sortAscending', 'Ascending')
                      : t('kanban.sortDescending', 'Descending')
                  }
                >
                  {kanbanFilters.sortDirection === 'asc' ? (
                    <SortAscendingIcon className="size-icon-base" />
                  ) : (
                    <SortDescendingIcon className="size-icon-base" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-base">
              <div className="text-xs uppercase tracking-wide text-low">
                {t('kanban.displaySettings', 'Display Settings')}
              </div>
              <div className="flex items-center gap-base flex-wrap">
                <div className="flex items-center gap-half px-base py-half bg-panel rounded-sm">
                  <span className="text-sm text-normal whitespace-nowrap">
                    {t('kanban.subIssuesFilterLabel', 'Sub-issues')}
                  </span>
                  <Switch
                    checked={showSubIssues}
                    onCheckedChange={(checked) =>
                      setShowSubIssues(projectId, checked)
                    }
                  />
                </div>

                <div className="flex items-center gap-half px-base py-half bg-panel rounded-sm">
                  <span className="text-sm text-normal whitespace-nowrap">
                    {t('kanban.workspacesFilterLabel', 'Workspaces')}
                  </span>
                  <Switch
                    checked={showWorkspaces}
                    onCheckedChange={(checked) =>
                      setShowWorkspaces(projectId, checked)
                    }
                  />
                </div>

                <KanbanDisplaySettingsContainer
                  statuses={statuses}
                  projectId={projectId}
                  issueCountByStatus={issueCountByStatus}
                  onInsertStatus={onInsertStatus}
                  onUpdateStatus={onUpdateStatus}
                  onRemoveStatus={onRemoveStatus}
                />

                {hasActiveFilters && (
                  <PrimaryButton
                    variant="tertiary"
                    value={t('kanban.clearFilters', 'Clear all')}
                    actionIcon={XIcon}
                    onClick={() => clearKanbanFilters(projectId)}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
