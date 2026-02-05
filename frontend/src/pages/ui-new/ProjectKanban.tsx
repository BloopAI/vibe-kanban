import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Group, Layout, Panel, Separator } from 'react-resizable-panels';
import { OrgProvider, useOrgContext } from '@/contexts/remote/OrgContext';
import {
  ProjectProvider,
  useProjectContext,
} from '@/contexts/remote/ProjectContext';
import { useActions } from '@/contexts/ActionsContext';
import { KanbanContainer } from '@/components/ui-new/containers/KanbanContainer';
import { KanbanIssuePanelContainer } from '@/components/ui-new/containers/KanbanIssuePanelContainer';
import { LoginRequiredPrompt } from '@/components/dialogs/shared/LoginRequiredPrompt';
import { PERSIST_KEYS, usePaneSize } from '@/stores/useUiPreferencesStore';
import { useUserOrganizations } from '@/hooks/useUserOrganizations';
import { useOrganizationProjects } from '@/hooks/useOrganizationProjects';
import { useOrganizationStore } from '@/stores/useOrganizationStore';
import { useKanbanNavigation } from '@/hooks/useKanbanNavigation';
import { useAuth } from '@/hooks/auth/useAuth';

/**
 * Component that registers project mutations with ActionsContext.
 * Must be rendered inside both ActionsProvider and ProjectProvider.
 */
function ProjectMutationsRegistration({ children }: { children: ReactNode }) {
  const { registerProjectMutations } = useActions();
  const { removeIssue, insertIssue, getIssue, issues } = useProjectContext();

  // Use ref to always access latest issues (avoid stale closure)
  const issuesRef = useRef(issues);
  useEffect(() => {
    issuesRef.current = issues;
  }, [issues]);

  useEffect(() => {
    registerProjectMutations({
      removeIssue: (id) => {
        removeIssue(id);
      },
      duplicateIssue: (issueId) => {
        const issue = getIssue(issueId);
        if (!issue) return;

        // Use ref to get current issues (not stale closure)
        const currentIssues = issuesRef.current;
        const statusIssues = currentIssues.filter(
          (i) => i.status_id === issue.status_id
        );
        const minSortOrder =
          statusIssues.length > 0
            ? Math.min(...statusIssues.map((i) => i.sort_order))
            : 0;

        insertIssue({
          project_id: issue.project_id,
          status_id: issue.status_id,
          title: `${issue.title} (Copy)`,
          description: issue.description,
          priority: issue.priority,
          sort_order: minSortOrder - 1,
          start_date: issue.start_date,
          target_date: issue.target_date,
          completed_at: null,
          parent_issue_id: issue.parent_issue_id,
          parent_issue_sort_order: issue.parent_issue_sort_order,
          extension_metadata: issue.extension_metadata,
        });
      },
    });

    return () => {
      registerProjectMutations(null);
    };
  }, [registerProjectMutations, removeIssue, insertIssue, getIssue]);

  return <>{children}</>;
}

/**
 * Inner component that renders the Kanban board once we have the org context
 */
function ProjectKanbanInner({ projectId }: { projectId: string }) {
  const { t } = useTranslation('common');
  const { projects, isLoading } = useOrgContext();

  // Panel visibility derived from URL
  const { isPanelOpen } = useKanbanNavigation();

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
    if (isPanelOpen) {
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
      <ProjectMutationsRegistration>
        <Group
          orientation="horizontal"
          className="flex-1 min-w-0 h-full"
          defaultLayout={kanbanDefaultLayout}
          onLayoutChange={onKanbanLayoutChange}
        >
          <Panel
            id="kanban-left"
            minSize="20%"
            className="min-w-0 h-full overflow-hidden bg-primary"
          >
            <KanbanContainer />
          </Panel>

          {isPanelOpen && (
            <Separator
              id="kanban-separator"
              className="w-1 bg-panel outline-none hover:bg-brand/50 transition-colors cursor-col-resize"
            />
          )}

          {isPanelOpen && (
            <Panel
              id="kanban-right"
              minSize="400px"
              maxSize="800px"
              className="min-w-0 h-full overflow-hidden bg-secondary"
            >
              <KanbanIssuePanelContainer />
            </Panel>
          )}
        </Group>
      </ProjectMutationsRegistration>
    </ProjectProvider>
  );
}

/**
 * Hook to find a project by ID, using orgId from Zustand store
 */
function useFindProjectById(projectId: string | undefined) {
  const { isLoaded: authLoaded } = useAuth();
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
    // Include auth loading state - we can't determine project access until auth loads
    isLoading: !authLoaded || orgsLoading || projectsLoading,
  };
}

/**
 * ProjectKanban page - displays the Kanban board for a specific project
 *
 * URL patterns:
 * - /projects/:projectId - Kanban board with no issue selected
 * - /projects/:projectId/issues/:issueId - Kanban with issue panel open
 * - /projects/:projectId?mode=create - Kanban with create issue panel
 *
 * Note: This component is rendered inside SharedAppLayout which provides
 * NavbarContainer, AppBar, and SyncErrorProvider.
 */
export function ProjectKanban() {
  const { projectId, issueId } = useKanbanNavigation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  const setSelectedOrgId = useOrganizationStore((s) => s.setSelectedOrgId);
  const { isSignedIn, isLoaded: authLoaded } = useAuth();

  // One-time migration: if orgId is in URL, save to store and clean URL
  useEffect(() => {
    const orgIdFromUrl = searchParams.get('orgId');
    if (orgIdFromUrl && projectId) {
      setSelectedOrgId(orgIdFromUrl);
      // Preserve issueId if present
      const targetUrl = issueId
        ? `/projects/${projectId}/issues/${issueId}`
        : `/projects/${projectId}`;
      navigate(targetUrl, { replace: true });
    }
  }, [searchParams, projectId, issueId, setSelectedOrgId, navigate]);

  // Find the project and get its organization
  const { organizationId, isLoading } = useFindProjectById(
    projectId ?? undefined
  );

  // Show loading while auth state is being determined
  if (!authLoaded || isLoading) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <p className="text-low">{t('loading')}</p>
      </div>
    );
  }

  // If not signed in, prompt user to log in
  if (!isSignedIn) {
    return (
      <div className="flex items-center justify-center h-full w-full p-base">
        <LoginRequiredPrompt
          className="max-w-md"
          title={t('kanban.loginRequired.title')}
          description={t('kanban.loginRequired.description')}
          actionLabel={t('kanban.loginRequired.action')}
        />
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
