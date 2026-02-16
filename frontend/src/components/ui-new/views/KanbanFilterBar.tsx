import { useTranslation } from 'react-i18next';
import { FunnelIcon, PlusIcon, XIcon } from '@phosphor-icons/react';
import type { IssuePriority, Tag } from 'shared/remote-types';
import type { OrganizationMemberWithProfile } from 'shared/types';
import { cn } from '@/lib/utils';
import {
  KANBAN_PROJECT_VIEW_IDS,
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
  activeViewId: string;
  onViewChange: (viewId: string) => void;
  projectId: string;
  currentUserId: string | null;
  filters: KanbanFilterState;
  showSubIssues: boolean;
  showWorkspaces: boolean;
  hasActiveFilters: boolean;
  onSearchQueryChange: (searchQuery: string) => void;
  onPrioritiesChange: (priorities: IssuePriority[]) => void;
  onAssigneesChange: (assigneeIds: string[]) => void;
  onTagsChange: (tagIds: string[]) => void;
  onSortChange: (
    sortField: KanbanSortField,
    sortDirection: 'asc' | 'desc'
  ) => void;
  onShowSubIssuesChange: (show: boolean) => void;
  onShowWorkspacesChange: (show: boolean) => void;
  onClearFilters: () => void;
  onCreateIssue: () => void;
  shouldAnimateCreateButton: boolean;
}

export function KanbanFilterBar({
  isFiltersDialogOpen,
  onFiltersDialogOpenChange,
  tags,
  users,
  activeViewId,
  onViewChange,
  projectId,
  currentUserId,
  filters,
  showSubIssues,
  showWorkspaces,
  hasActiveFilters,
  onSearchQueryChange,
  onPrioritiesChange,
  onAssigneesChange,
  onTagsChange,
  onSortChange,
  onShowSubIssuesChange,
  onShowWorkspacesChange,
  onClearFilters,
  onCreateIssue,
  shouldAnimateCreateButton,
}: KanbanFilterBarProps) {
  const { t } = useTranslation('common');

  const handleClearSearch = () => {
    onSearchQueryChange('');
  };

  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center gap-base">
        <ButtonGroup className="flex-wrap">
          <ButtonGroupItem
            active={activeViewId === KANBAN_PROJECT_VIEW_IDS.TEAM}
            onClick={() => onViewChange(KANBAN_PROJECT_VIEW_IDS.TEAM)}
          >
            {t('kanban.team', 'Team')}
          </ButtonGroupItem>
          <ButtonGroupItem
            active={activeViewId === KANBAN_PROJECT_VIEW_IDS.PERSONAL}
            onClick={() => onViewChange(KANBAN_PROJECT_VIEW_IDS.PERSONAL)}
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
          onClick={() => onCreateIssue()}
          className={cn(shouldAnimateCreateButton && 'create-issue-attention')}
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
        showSubIssues={showSubIssues}
        showWorkspaces={showWorkspaces}
        onPrioritiesChange={onPrioritiesChange}
        onAssigneesChange={onAssigneesChange}
        onTagsChange={onTagsChange}
        onSortChange={onSortChange}
        onShowSubIssuesChange={onShowSubIssuesChange}
        onShowWorkspacesChange={onShowWorkspacesChange}
      />
    </>
  );
}
