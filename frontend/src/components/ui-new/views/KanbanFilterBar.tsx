import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FunnelIcon, PlusIcon, XIcon } from '@phosphor-icons/react';
import type { IssuePriority, Tag } from 'shared/remote-types';
import type { OrganizationMemberWithProfile } from 'shared/types';
import { cn } from '@/lib/utils';
import {
  useUiPreferencesStore,
  KANBAN_PROJECT_VIEW_IDS,
  resolveKanbanProjectState,
  type KanbanFilterState,
  type KanbanSortField,
} from '@/stores/useUiPreferencesStore';
import { InputField } from '@/components/ui-new/primitives/InputField';
import { PrimaryButton } from '@/components/ui-new/primitives/PrimaryButton';
import {
  ButtonGroup,
  ButtonGroupItem,
} from '@/components/ui-new/primitives/IconButtonGroup';
import { KanbanFiltersDialog } from '@/components/ui-new/dialogs/KanbanFiltersDialog';

interface KanbanFilterBarProps {
  isFiltersDialogOpen: boolean;
  onFiltersDialogOpenChange: (open: boolean) => void;
  tags: Tag[];
  users: OrganizationMemberWithProfile[];
  projectId: string;
  currentUserId: string | null;
  filters: KanbanFilterState;
  hasActiveFilters: boolean;
  onSearchQueryChange: (searchQuery: string) => void;
  onPrioritiesChange: (priorities: IssuePriority[]) => void;
  onAssigneesChange: (assigneeIds: string[]) => void;
  onTagsChange: (tagIds: string[]) => void;
  onSortChange: (
    sortField: KanbanSortField,
    sortDirection: 'asc' | 'desc'
  ) => void;
  onClearFilters: () => void;
  onCreateIssue: () => void;
}

export function KanbanFilterBar({
  isFiltersDialogOpen,
  onFiltersDialogOpenChange,
  tags,
  users,
  projectId,
  currentUserId,
  filters,
  hasActiveFilters,
  onSearchQueryChange,
  onPrioritiesChange,
  onAssigneesChange,
  onTagsChange,
  onSortChange,
  onClearFilters,
  onCreateIssue,
}: KanbanFilterBarProps) {
  const { t } = useTranslation('common');

  const projectViewSelection = useUiPreferencesStore(
    (s) => s.kanbanProjectViewSelections[projectId]
  );
  const setKanbanProjectView = useUiPreferencesStore(
    (s) => s.setKanbanProjectView
  );

  const { activeViewId } = useMemo(
    () => resolveKanbanProjectState(projectViewSelection),
    [projectViewSelection]
  );

  const handleViewChange = (viewId: string) => {
    setKanbanProjectView(projectId, viewId);
  };

  const handleClearSearch = () => {
    onSearchQueryChange('');
  };

  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center gap-base">
        <ButtonGroup className="flex-wrap">
          <ButtonGroupItem
            active={activeViewId === KANBAN_PROJECT_VIEW_IDS.TEAM}
            onClick={() => handleViewChange(KANBAN_PROJECT_VIEW_IDS.TEAM)}
          >
            {t('kanban.team', 'Team')}
          </ButtonGroupItem>
          <ButtonGroupItem
            active={activeViewId === KANBAN_PROJECT_VIEW_IDS.PERSONAL}
            onClick={() => handleViewChange(KANBAN_PROJECT_VIEW_IDS.PERSONAL)}
          >
            {t('kanban.personal', 'Personal')}
          </ButtonGroupItem>
        </ButtonGroup>

        <InputField
          value={filters.searchQuery}
          onChange={onSearchQueryChange}
          placeholder={t('kanban.searchPlaceholder', 'Search issues...')}
          variant="search"
          actionIcon={filters.searchQuery ? XIcon : undefined}
          onAction={handleClearSearch}
          className="min-w-[160px] w-[220px] max-w-full"
        />

        <button
          type="button"
          onClick={() => onFiltersDialogOpenChange(true)}
          className={cn(
            'flex items-center justify-center p-half rounded-sm transition-colors',
            hasActiveFilters
              ? 'text-brand hover:text-brand'
              : 'text-low hover:text-normal hover:bg-secondary'
          )}
          aria-label={t('kanban.filters', 'Open filters')}
          title={t('kanban.filters', 'Open filters')}
        >
          <FunnelIcon className="size-icon-sm" weight="bold" />
        </button>

        {hasActiveFilters && (
          <PrimaryButton
            variant="tertiary"
            value={t('kanban.clearFilters', 'Clear filters')}
            actionIcon={XIcon}
            onClick={onClearFilters}
          />
        )}

        <PrimaryButton
          variant="secondary"
          value={t('kanban.newIssue', 'New issue')}
          actionIcon={PlusIcon}
          onClick={onCreateIssue}
        />
      </div>

      <KanbanFiltersDialog
        open={isFiltersDialogOpen}
        onOpenChange={onFiltersDialogOpenChange}
        projectId={projectId}
        currentUserId={currentUserId}
        tags={tags}
        users={users}
        filters={filters}
        onPrioritiesChange={onPrioritiesChange}
        onAssigneesChange={onAssigneesChange}
        onTagsChange={onTagsChange}
        onSortChange={onSortChange}
      />
    </>
  );
}
