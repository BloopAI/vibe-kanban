import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FunnelIcon, PlusIcon, XIcon } from '@phosphor-icons/react';
import type { Tag, ProjectStatus } from 'shared/remote-types';
import type { OrganizationMemberWithProfile } from 'shared/types';
import { cn } from '@/lib/utils';
import {
  useUiPreferencesStore,
  KANBAN_PROJECT_VIEW_IDS,
  resolveKanbanProjectState,
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
  onCreateIssue: () => void;
}

export function KanbanFilterBar({
  isFiltersDialogOpen,
  onFiltersDialogOpenChange,
  tags,
  users,
  hasActiveFilters,
  statuses,
  projectId,
  issueCountByStatus,
  onInsertStatus,
  onUpdateStatus,
  onRemoveStatus,
  onCreateIssue,
}: KanbanFilterBarProps) {
  const { t } = useTranslation('common');

  const projectViewState = useUiPreferencesStore(
    (s) => s.kanbanProjectViewsByProject[projectId]
  );
  const applyKanbanView = useUiPreferencesStore((s) => s.applyKanbanView);
  const clearKanbanFilters = useUiPreferencesStore((s) => s.clearKanbanFilters);
  const setKanbanSearchQuery = useUiPreferencesStore(
    (s) => s.setKanbanSearchQuery
  );

  const { activeViewId, filters: kanbanFilters } = useMemo(
    () => resolveKanbanProjectState(projectViewState),
    [projectViewState]
  );

  const handleViewChange = (viewId: string) => {
    applyKanbanView(projectId, viewId);
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
          value={kanbanFilters.searchQuery}
          onChange={(query) => setKanbanSearchQuery(projectId, query)}
          placeholder={t('kanban.searchPlaceholder', 'Search issues...')}
          variant="search"
          actionIcon={kanbanFilters.searchQuery ? XIcon : undefined}
          onAction={() => setKanbanSearchQuery(projectId, '')}
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
            onClick={() => clearKanbanFilters(projectId)}
          />
        )}

        <PrimaryButton
          variant="secondary"
          value={t('kanban.newIssue', 'New issue')}
          actionIcon={PlusIcon}
          onClick={() => onCreateIssue()}
        />
      </div>

      <KanbanFiltersDialog
        open={isFiltersDialogOpen}
        onOpenChange={onFiltersDialogOpenChange}
        tags={tags}
        users={users}
        hasActiveFilters={hasActiveFilters}
        statuses={statuses}
        projectId={projectId}
        issueCountByStatus={issueCountByStatus}
        onInsertStatus={onInsertStatus}
        onUpdateStatus={onUpdateStatus}
        onRemoveStatus={onRemoveStatus}
      />
    </>
  );
}
