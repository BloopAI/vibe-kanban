import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  UsersIcon,
  TagIcon,
  SortAscendingIcon,
  SortDescendingIcon,
  XIcon,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import {
  useUiPreferencesStore,
  type KanbanSortField,
} from '@/stores/useUiPreferencesStore';
import type { Tag, ProjectStatus } from 'shared/remote-types';
import type { OrganizationMemberWithProfile } from 'shared/types';
import { UserAvatar } from '@/components/ui-new/primitives/UserAvatar';
import { KanbanAssignee } from '@/components/ui-new/primitives/KanbanAssignee';
import { Badge } from '@/components/ui/badge';
import { InputField } from '@/components/ui-new/primitives/InputField';
import { PrimaryButton } from '@/components/ui-new/primitives/PrimaryButton';
import {
  PropertyDropdown,
  type PropertyDropdownOption,
} from '@/components/ui-new/primitives/PropertyDropdown';
import {
  MultiSelectDropdown,
  type MultiSelectDropdownOption,
} from '@/components/ui-new/primitives/MultiSelectDropdown';
import { PriorityFilterDropdown } from '@/components/ui-new/views/PriorityFilterDropdown';
import { KanbanDisplaySettingsContainer } from '@/components/ui-new/containers/KanbanDisplaySettingsContainer';

// =============================================================================
// Types
// =============================================================================

interface KanbanFilterBarProps {
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

// =============================================================================
// Sort options
// =============================================================================

const SORT_OPTIONS: PropertyDropdownOption<KanbanSortField>[] = [
  { value: 'sort_order', label: 'Manual' },
  { value: 'priority', label: 'Priority' },
  { value: 'created_at', label: 'Created' },
  { value: 'updated_at', label: 'Updated' },
  { value: 'title', label: 'Title' },
];

// =============================================================================
// Helper to get user display name
// =============================================================================

const getUserDisplayName = (user: OrganizationMemberWithProfile): string => {
  return (
    [user.first_name, user.last_name].filter(Boolean).join(' ') ||
    user.username ||
    'User'
  );
};

// =============================================================================
// Main KanbanFilterBar Component
// =============================================================================

export function KanbanFilterBar({
  tags,
  users,
  hasActiveFilters,
  statuses,
  projectId,
  issueCountByStatus,
  onInsertStatus,
  onUpdateStatus,
  onRemoveStatus,
}: KanbanFilterBarProps) {
  const { t } = useTranslation('common');

  const kanbanFilters = useUiPreferencesStore((s) => s.kanbanFilters);
  const setKanbanSearchQuery = useUiPreferencesStore(
    (s) => s.setKanbanSearchQuery
  );
  const setKanbanPriorities = useUiPreferencesStore(
    (s) => s.setKanbanPriorities
  );
  const setKanbanAssignees = useUiPreferencesStore((s) => s.setKanbanAssignees);
  const setKanbanTags = useUiPreferencesStore((s) => s.setKanbanTags);
  const setKanbanSort = useUiPreferencesStore((s) => s.setKanbanSort);
  const clearKanbanFilters = useUiPreferencesStore((s) => s.clearKanbanFilters);

  // Build assignee options for MultiSelectDropdown
  const assigneeOptions: MultiSelectDropdownOption<string>[] = useMemo(
    () => [
      {
        value: 'unassigned',
        label: t('kanban.unassigned', 'Unassigned'),
        renderOption: () => (
          <div className="flex items-center gap-base">
            <UsersIcon className="size-icon-xs text-low" weight="bold" />
            {t('kanban.unassigned', 'Unassigned')}
          </div>
        ),
      },
      ...users.map((user) => ({
        value: user.user_id,
        label: getUserDisplayName(user),
        renderOption: () => (
          <div className="flex items-center gap-base">
            <UserAvatar user={user} className="h-4 w-4 text-[8px]" />
            {getUserDisplayName(user)}
          </div>
        ),
      })),
    ],
    [users, t]
  );

  // Build tag options for MultiSelectDropdown
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

  // Build user lookup for rendering selected assignee avatars in filter trigger
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
        .filter((id) => id !== 'unassigned')
        .map((id) => usersById.get(id))
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
    [usersById]
  );

  return (
    <div className="flex items-center gap-base flex-wrap">
      {/* Search Input */}
      <InputField
        value={kanbanFilters.searchQuery}
        onChange={setKanbanSearchQuery}
        placeholder={t('kanban.searchPlaceholder', 'Search issues...')}
        variant="search"
        actionIcon={kanbanFilters.searchQuery ? XIcon : undefined}
        onAction={() => setKanbanSearchQuery('')}
        className="min-w-[200px]"
      />

      {/* Priority Filter */}
      <PriorityFilterDropdown
        values={kanbanFilters.priorities}
        onChange={setKanbanPriorities}
      />

      {/* Assignee Filter */}
      <MultiSelectDropdown
        values={kanbanFilters.assigneeIds}
        options={assigneeOptions}
        onChange={setKanbanAssignees}
        icon={UsersIcon}
        label={t('kanban.assignee', 'Assignee')}
        menuLabel={t('kanban.filterByAssignee', 'Filter by assignee')}
        renderBadge={renderAssigneeBadge}
      />

      {/* Tags Filter */}
      {tags.length > 0 && (
        <MultiSelectDropdown
          values={kanbanFilters.tagIds}
          options={tagOptions}
          onChange={setKanbanTags}
          icon={TagIcon}
          label={t('kanban.tags', 'Tags')}
          menuLabel={t('kanban.filterByTag', 'Filter by tag')}
        />
      )}

      {/* Separator */}
      <div className="h-4 w-px bg-border" />

      {/* Sort Dropdown */}
      <PropertyDropdown
        value={kanbanFilters.sortField}
        options={SORT_OPTIONS}
        onChange={(field: KanbanSortField) =>
          setKanbanSort(field, kanbanFilters.sortDirection)
        }
        icon={
          kanbanFilters.sortDirection === 'asc'
            ? SortAscendingIcon
            : SortDescendingIcon
        }
        label={t('kanban.sortBy', 'Sort')}
      />

      {/* Sort Direction Toggle */}
      <button
        type="button"
        onClick={() => {
          const newDirection =
            kanbanFilters.sortDirection === 'asc' ? 'desc' : 'asc';
          setKanbanSort(kanbanFilters.sortField, newDirection);
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

      {/* Separator */}
      <div className="h-4 w-px bg-border" />

      {/* Display Settings */}
      <KanbanDisplaySettingsContainer
        statuses={statuses}
        projectId={projectId}
        issueCountByStatus={issueCountByStatus}
        onInsertStatus={onInsertStatus}
        onUpdateStatus={onUpdateStatus}
        onRemoveStatus={onRemoveStatus}
      />

      {/* Clear All Button */}
      {hasActiveFilters && (
        <>
          <div className="h-4 w-px bg-border" />
          <PrimaryButton
            variant="tertiary"
            value={t('kanban.clearFilters', 'Clear all')}
            actionIcon={XIcon}
            onClick={clearKanbanFilters}
          />
        </>
      )}
    </div>
  );
}
