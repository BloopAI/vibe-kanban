import { useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Group, Layout, Panel, Separator } from 'react-resizable-panels';
import { OrgProvider, useOrgContext } from '@/contexts/remote/OrgContext';
import { ProjectProvider } from '@/contexts/remote/ProjectContext';
import { KanbanContainer } from '@/components/ui-new/containers/KanbanContainer';
import { KanbanIssuePanelContainer } from '@/components/ui-new/containers/KanbanIssuePanelContainer';
import {
  PERSIST_KEYS,
  usePaneSize,
  useUiPreferencesStore,
} from '@/stores/useUiPreferencesStore';
import { useUserOrganizations } from '@/hooks/useUserOrganizations';
import { useOrganizationProjects } from '@/hooks/useOrganizationProjects';
import { useOrganizationStore } from '@/stores/useOrganizationStore';

/**
 * Inner component that renders the Kanban board once we have the org context
 */
function ProjectKanbanInner({ projectId }: { projectId: string }) {
  const { t } = useTranslation('common');
  const { projects, isLoading } = useOrgContext();
  const isKanbanRightPanelVisible = useUiPreferencesStore(
    (s) => s.isKanbanRightPanelVisible
  );

  const [kanbanLeftPanelSize, setKanbanLeftPanelSize] = usePaneSize(
    PERSIST_KEYS.kanbanLeftPanel,
    75
  );

  const kanbanDefaultLayout: Layout =
    typeof kanbanLeftPanelSize === 'number'
      ? {
          'kanban-left': kanbanLeftPanelSize,
          'kanban-right': 100 - kanbanLeftPanelSize,
        }
      : { 'kanban-left': 75, 'kanban-right': 25 };

  const onKanbanLayoutChange = (layout: Layout) => {
    if (isKanbanRightPanelVisible) {
      setKanbanLeftPanelSize(layout['kanban-left']);
    }
  };

  const project = projects.find((p) => p.id === projectId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <p className="text-low">{t('loading')}</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <p className="text-low">{t('kanban.noProjectFound')}</p>
      </div>
    );
  }

  return (
    <ProjectProvider projectId={projectId}>
      <Group
        orientation="horizontal"
        className="flex-1 min-w-0 h-full"
        defaultLayout={kanbanDefaultLayout}
        onLayoutChange={onKanbanLayoutChange}
      >
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

/**
 * Hook to find a project by ID, using orgId from Zustand store
 */
function useFindProjectById(projectId: string | undefined) {
  const { data: orgsData, isLoading: orgsLoading } = useUserOrganizations();
  const selectedOrgId = useOrganizationStore((s) => s.selectedOrgId);
  const organizations = orgsData?.organizations ?? [];

  // Use stored org ID, or fall back to first org
  const orgIdToUse = selectedOrgId ?? organizations[0]?.id ?? null;

  const { data: projects = [], isLoading: projectsLoading } =
    useOrganizationProjects(orgIdToUse);

  const project = useMemo(() => {
    if (!projectId) return undefined;
    return projects.find((p) => p.id === projectId);
  }, [projectId, projects]);

  return {
    project,
    organizationId: project?.organization_id ?? selectedOrgId,
    isLoading: orgsLoading || projectsLoading,
  };
}

/**
 * ProjectKanban page - displays the Kanban board for a specific project
 * URL: /projects/:projectId
 *
 * Note: This component is rendered inside SharedAppLayout which provides
 * NavbarContainer, AppBar, and SyncErrorProvider.
 */
export function ProjectKanban() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  const setSelectedOrgId = useOrganizationStore((s) => s.setSelectedOrgId);

  // One-time migration: if orgId is in URL, save to store and clean URL
  useEffect(() => {
    const orgIdFromUrl = searchParams.get('orgId');
    if (orgIdFromUrl && projectId) {
      setSelectedOrgId(orgIdFromUrl);
      navigate(`/projects/${projectId}`, { replace: true });
    }
  }, [searchParams, projectId, setSelectedOrgId, navigate]);

  // Find the project and get its organization
  const { organizationId, isLoading } = useFindProjectById(projectId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <p className="text-low">{t('loading')}</p>
      </div>
    );
  }

  if (!projectId || !organizationId) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <p className="text-low">{t('kanban.noProjectFound')}</p>
      </div>
    );
  }

  return (
    <OrgProvider organizationId={organizationId}>
      <ProjectKanbanInner projectId={projectId} />
    </OrgProvider>
  );
}
