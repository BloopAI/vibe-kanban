import { Group, Layout, Panel, Separator } from 'react-resizable-panels';
import { useTranslation } from 'react-i18next';
import { useOrgContext } from '@/contexts/remote/OrgContext';
import { ProjectProvider } from '@/contexts/remote/ProjectContext';
import { KanbanContainer } from '@/components/ui-new/containers/KanbanContainer';
import { KanbanIssuePanelContainer } from '@/components/ui-new/containers/KanbanIssuePanelContainer';

interface KanbanLayoutContainerProps {
  kanbanDefaultLayout: Layout;
  onKanbanLayoutChange: (layout: Layout) => void;
  isKanbanRightPanelVisible: boolean;
}

/**
 * KanbanLayoutContainer accesses OrgContext and sets up ProjectProvider.
 * Separated to allow proper hook usage within provider hierarchy.
 */
export function KanbanLayoutContainer({
  kanbanDefaultLayout,
  onKanbanLayoutChange,
  isKanbanRightPanelVisible,
}: KanbanLayoutContainerProps) {
  const { t } = useTranslation('common');
  const { projects, isLoading } = useOrgContext();
  const firstProject = projects[0];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <p className="text-low">{t('loading')}</p>
      </div>
    );
  }

  if (!firstProject) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <p className="text-low">{t('kanban.noProjectFound')}</p>
      </div>
    );
  }

  return (
    <ProjectProvider projectId={firstProject.id}>
      <Group
        orientation="horizontal"
        className="flex-1 min-w-0 h-full"
        defaultLayout={kanbanDefaultLayout}
        onLayoutChange={onKanbanLayoutChange}
      >
        {/* Left Kanban Panel */}
        <Panel
          id="kanban-left"
          minSize="20%"
          className="min-w-0 h-full overflow-hidden bg-secondary"
        >
          <KanbanContainer />
        </Panel>

        {isKanbanRightPanelVisible && (
          <Separator
            id="kanban-separator"
            className="w-1 bg-transparent hover:bg-brand/50 transition-colors cursor-col-resize"
          />
        )}

        {isKanbanRightPanelVisible && (
          <Panel
            id="kanban-right"
            minSize="20%"
            className="min-w-0 h-full overflow-hidden bg-secondary"
          >
            <KanbanIssuePanelContainer />
          </Panel>
        )}
      </Group>
    </ProjectProvider>
  );
}
