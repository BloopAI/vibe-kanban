import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { PlusIcon } from '@phosphor-icons/react';
import type { ProjectStatus } from 'shared/remote-types';
import {
  useUiPreferencesStore,
  KANBAN_PROJECT_VIEW_IDS,
  resolveKanbanProjectState,
} from '@/stores/useUiPreferencesStore';
import { PrimaryButton } from '@/components/ui-new/primitives/PrimaryButton';
import {
  ButtonGroup,
  ButtonGroupItem,
} from '@/components/ui-new/primitives/IconButtonGroup';
import { KanbanDisplaySettingsContainer } from '@/components/ui-new/containers/KanbanDisplaySettingsContainer';

interface KanbanFilterBarProps {
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
  statuses,
  projectId,
  issueCountByStatus,
  onInsertStatus,
  onUpdateStatus,
  onRemoveStatus,
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

  return (
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

      <KanbanDisplaySettingsContainer
        statuses={statuses}
        projectId={projectId}
        issueCountByStatus={issueCountByStatus}
        onInsertStatus={onInsertStatus}
        onUpdateStatus={onUpdateStatus}
        onRemoveStatus={onRemoveStatus}
      />

      <PrimaryButton
        variant="secondary"
        value={t('kanban.newIssue', 'New issue')}
        actionIcon={PlusIcon}
        onClick={onCreateIssue}
      />
    </div>
  );
}
