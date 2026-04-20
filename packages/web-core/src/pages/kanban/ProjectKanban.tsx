import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Group, Layout, Panel, Separator } from 'react-resizable-panels';
import { LocalKanbanOrgProvider } from '@/shared/providers/local/LocalKanbanOrgProvider';
import { LocalKanbanProjectProvider } from '@/shared/providers/local/LocalKanbanProjectProvider';
import { useProjectContext } from '@/shared/hooks/useProjectContext';
import { useActions } from '@/shared/hooks/useActions';
import { usePageTitle } from '@/shared/hooks/usePageTitle';
import { KanbanContainer } from '@/features/kanban/ui/KanbanContainer';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { ProjectRightSidebarContainer } from './ProjectRightSidebarContainer';
import {
  PERSIST_KEYS,
  usePaneSize,
} from '@/shared/stores/useUiPreferencesStore';
import { useCurrentKanbanRouteState } from '@/shared/hooks/useCurrentKanbanRouteState';
import { useAppNavigation } from '@/shared/hooks/useAppNavigation';
import { useOrgContext } from '@/shared/hooks/useOrgContext';
import {
  buildKanbanIssueComposerKey,
  closeKanbanIssueComposer,
} from '@/shared/stores/useKanbanIssueComposerStore';

/**
 * Component that registers project mutations with ActionsContext.
 * Must be rendered inside both ActionsProvider and LocalKanbanProjectProvider.
 */
function ProjectMutationsRegistration({ children }: { children: ReactNode }) {
  const { registerProjectMutations } = useActions();
  const { removeIssue, insertIssue, getIssue, getAssigneesForIssue, issues } =
    useProjectContext();

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
      getIssue,
      getAssigneesForIssue,
    });

    return () => {
      registerProjectMutations(null);
    };
  }, [
    registerProjectMutations,
    removeIssue,
    insertIssue,
    getIssue,
    getAssigneesForIssue,
  ]);

  return <>{children}</>;
}

function ProjectKanbanBoard() {
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="min-h-0 flex-1">
        <KanbanContainer />
      </div>
    </div>
  );
}

function ProjectKanbanLayout({ projectName }: { projectName: string }) {
  const { issueId, isPanelOpen } = useCurrentKanbanRouteState();
  const isMobile = useIsMobile();
  const { getIssue } = useProjectContext();
  const issue = issueId ? getIssue(issueId) : undefined;
  usePageTitle(issue?.title, projectName);
  const [kanbanLeftPanelSize, setKanbanLeftPanelSize] = usePaneSize(
    PERSIST_KEYS.kanbanLeftPanel,
    75
  );

  const isRightPanelOpen = isPanelOpen;

  if (isMobile) {
    return isRightPanelOpen ? (
      <div className="h-full w-full overflow-hidden bg-secondary">
        <ProjectRightSidebarContainer />
      </div>
    ) : (
      <div className="h-full w-full overflow-hidden bg-primary">
        <ProjectKanbanBoard />
      </div>
    );
  }

  const kanbanDefaultLayout: Layout =
    typeof kanbanLeftPanelSize === 'number'
      ? {
          'kanban-left': kanbanLeftPanelSize,
          'kanban-right': 100 - kanbanLeftPanelSize,
        }
      : { 'kanban-left': 75, 'kanban-right': 25 };

  const onKanbanLayoutChange = (layout: Layout) => {
    if (isRightPanelOpen) {
      setKanbanLeftPanelSize(layout['kanban-left']);
    }
  };

  return (
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
        <ProjectKanbanBoard />
      </Panel>

      {isRightPanelOpen && (
        <Separator
          id="kanban-separator"
          className="w-1 bg-panel outline-none hover:bg-brand/50 transition-colors cursor-col-resize"
        />
      )}

      {isRightPanelOpen && (
        <Panel
          id="kanban-right"
          minSize="400px"
          maxSize="800px"
          className="min-w-0 h-full overflow-hidden bg-secondary"
        >
          <ProjectRightSidebarContainer />
        </Panel>
      )}
    </Group>
  );
}

/**
 * Inner component rendered once we have the org context with the project list.
 */
function ProjectKanbanInner({ projectId }: { projectId: string }) {
  const { t } = useTranslation('common');
  const { projects, isLoading } = useOrgContext();
  const project = projects.find((p) => p.id === projectId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <p className="text-low">{t('states.loading')}</p>
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
    <LocalKanbanProjectProvider projectId={projectId}>
      <ProjectMutationsRegistration>
        <ProjectKanbanLayout projectName={project.name} />
      </ProjectMutationsRegistration>
    </LocalKanbanProjectProvider>
  );
}

/**
 * ProjectKanban page — displays the local Kanban board for a specific project.
 *
 * URL patterns:
 * - /projects/:projectId
 * - /projects/:projectId/issues/:issueId
 */
export function ProjectKanban() {
  const { projectId, hostId, hasInvalidWorkspaceCreateDraftId } =
    useCurrentKanbanRouteState();
  const appNavigation = useAppNavigation();
  const { t } = useTranslation('common');

  const issueComposerKey = useMemo(() => {
    if (!projectId) return null;
    return buildKanbanIssueComposerKey(hostId, projectId);
  }, [hostId, projectId]);
  const previousIssueComposerKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const previousKey = previousIssueComposerKeyRef.current;
    if (previousKey && previousKey !== issueComposerKey) {
      closeKanbanIssueComposer(previousKey);
    }
    previousIssueComposerKeyRef.current = issueComposerKey;
  }, [issueComposerKey]);

  useEffect(() => {
    if (!projectId) return;
    if (hasInvalidWorkspaceCreateDraftId) {
      appNavigation.goToProject(projectId, { replace: true });
    }
  }, [projectId, hasInvalidWorkspaceCreateDraftId, appNavigation]);

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <p className="text-low">{t('kanban.noProjectFound')}</p>
      </div>
    );
  }

  return (
    <LocalKanbanOrgProvider>
      <ProjectKanbanInner projectId={projectId} />
    </LocalKanbanOrgProvider>
  );
}
