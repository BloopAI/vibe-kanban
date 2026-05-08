import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { LoginRequiredPrompt } from '@/shared/dialogs/shared/LoginRequiredPrompt';
import { useUserOrganizations } from '@/shared/hooks/useUserOrganizations';
import { useOrganizationProjects } from '@/shared/hooks/useOrganizationProjects';
import { useOrganizationStore } from '@/shared/stores/useOrganizationStore';
import { useAuth } from '@/shared/hooks/auth/useAuth';
import { useCurrentKanbanRouteState } from '@/shared/hooks/useCurrentKanbanRouteState';
import {
  buildKanbanIssueComposerKey,
  closeKanbanIssueComposer,
} from '@/shared/stores/useKanbanIssueComposerStore';
import { ProjectSunsetPage } from './ProjectSunsetPage';

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
 * - /projects/:projectId/issues/:issueId/workspaces/:workspaceId - Kanban with workspace session panel open
 * - /projects/:projectId/issues/:issueId/workspaces/create/:draftId - Kanban with workspace create panel
 *
 * Note: issue creation is composer-store state on top of /projects/:projectId.
 *
 * Note: This component is rendered inside SharedAppLayout which provides
 * NavbarContainer, AppBar, and SyncErrorProvider.
 */
export function ProjectKanban() {
  const { projectId, hostId } = useCurrentKanbanRouteState();
  const { t } = useTranslation('common');
  const { isSignedIn, isLoaded: authLoaded } = useAuth();
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

  // Find the project and get its organization
  const { project, organizationId, isLoading } = useFindProjectById(
    projectId ?? undefined
  );

  // Show loading while auth state is being determined
  if (!authLoaded || isLoading) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <p className="text-low">{t('states.loading')}</p>
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

  return <ProjectSunsetPage projectName={project?.name} />;
}
