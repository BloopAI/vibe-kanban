import { useTranslation } from 'react-i18next';
import { FunnelIcon, XIcon } from '@phosphor-icons/react';
import type { Tag, ProjectStatus } from 'shared/remote-types';
import type { OrganizationMemberWithProfile } from 'shared/types';
import { cn } from '@/lib/utils';
import {
  useUiPreferencesStore,
  DEFAULT_KANBAN_PROJECT_VIEW_ID,
  KANBAN_PROJECT_VIEW_IDS,
} from '@/stores/useUiPreferencesStore';
import { InputField } from '@/components/ui-new/primitives/InputField';
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
}: KanbanFilterBarProps) {
  const { t } = useTranslation('common');

  const kanbanFilters = useUiPreferencesStore((s) => s.kanbanFilters);
  const projectViewState = useUiPreferencesStore(
    (s) => s.kanbanProjectViewsByProject[projectId]
  );
  const applyKanbanView = useUiPreferencesStore((s) => s.applyKanbanView);
  const setKanbanSearchQuery = useUiPreferencesStore(
    (s) => s.setKanbanSearchQuery
  );

  const activeViewId =
    projectViewState?.activeViewId ?? DEFAULT_KANBAN_PROJECT_VIEW_ID;

  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center gap-base">
        <ButtonGroup className="flex-wrap">
          <ButtonGroupItem
            active={activeViewId === KANBAN_PROJECT_VIEW_IDS.TEAM}
            onClick={() =>
              applyKanbanView(projectId, KANBAN_PROJECT_VIEW_IDS.TEAM)
            }
          >
            {t('kanban.team', 'Team')}
          </ButtonGroupItem>
          <ButtonGroupItem
            active={activeViewId === KANBAN_PROJECT_VIEW_IDS.PERSONAL}
            onClick={() =>
              applyKanbanView(projectId, KANBAN_PROJECT_VIEW_IDS.PERSONAL)
            }
          >
            {t('kanban.personal', 'Personal')}
          </ButtonGroupItem>
        </ButtonGroup>

        <InputField
          value={kanbanFilters.searchQuery}
          onChange={setKanbanSearchQuery}
          placeholder={t('kanban.searchPlaceholder', 'Search issues...')}
          variant="search"
          actionIcon={kanbanFilters.searchQuery ? XIcon : undefined}
          onAction={() => setKanbanSearchQuery('')}
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
