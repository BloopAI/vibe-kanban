import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Project as RemoteProject } from 'shared/remote-types';
import { useTranslation } from 'react-i18next';
import {
  buildKanbanIssueComposerKey,
  closeKanbanIssueComposer,
} from '@/shared/stores/useKanbanIssueComposerStore';
import { useCurrentKanbanRouteState } from '@/shared/hooks/useCurrentKanbanRouteState';
import { useAppNavigation } from '@/shared/hooks/useAppNavigation';
import { OrgContext, type OrgContextValue } from '@/shared/hooks/useOrgContext';
import { ProjectProvider } from '@/shared/providers/remote/ProjectProvider';
import {
  ProjectKanbanLayout,
  ProjectMutationsRegistration,
} from '@/pages/kanban/ProjectKanban';
import { projectsApi } from '@/shared/lib/api';

function createLocalProjectView(projectId: string, name: string): RemoteProject {
  const now = new Date().toISOString();
  return {
    id: projectId,
    organization_id: 'local',
    name,
    color: 'local',
    sort_order: 0,
    created_at: now,
    updated_at: now,
  };
}

export function LocalProjectKanban() {
  const { t } = useTranslation('common');
  const { projectId, hostId, hasInvalidWorkspaceCreateDraftId } =
    useCurrentKanbanRouteState();
  const appNavigation = useAppNavigation();
  const issueComposerKey = useMemo(() => {
    if (!projectId) {
      return null;
    }
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
      appNavigation.goToProject(projectId, {
        replace: true,
      });
    }
  }, [projectId, hasInvalidWorkspaceCreateDraftId, appNavigation]);

  const {
    data: project,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['local-project', projectId],
    queryFn: () => projectsApi.getById(projectId!),
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const orgValue = useMemo<OrgContextValue | null>(() => {
    if (!projectId) {
      return null;
    }

    const localProject = createLocalProjectView(
      projectId,
      project?.name ?? 'Project'
    );
    const projectsById = new Map([[localProject.id, localProject]]);

    return {
      organizationId: 'local',
      projects: [localProject],
      isLoading: false,
      error: null,
      retry: () => {},
      insertProject: (data) => {
        const optimisticProject = createLocalProjectView(
          crypto.randomUUID(),
          data.name
        );
        return {
          data: optimisticProject,
          persisted: Promise.resolve(optimisticProject),
        };
      },
      updateProject: () => ({ persisted: Promise.resolve() }),
      removeProject: () => ({ persisted: Promise.resolve() }),
      getProject: (candidateProjectId) => projectsById.get(candidateProjectId),
      projectsById,
      membersWithProfilesById: new Map(),
    };
  }, [projectId, project?.name]);

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <p className="text-low">{t('kanban.noProjectFound')}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <p className="text-low">{t('states.loading')}</p>
      </div>
    );
  }

  if (error || !project || !orgValue) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <p className="text-low">{t('kanban.noProjectFound')}</p>
      </div>
    );
  }

  return (
    <OrgContext.Provider value={orgValue}>
      <ProjectProvider projectId={projectId}>
        <ProjectMutationsRegistration>
          <ProjectKanbanLayout projectName={project.name} />
        </ProjectMutationsRegistration>
      </ProjectProvider>
    </OrgContext.Provider>
  );
}
