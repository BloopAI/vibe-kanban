import { router } from '@web/app/router';
import {
  type AppDestination,
  type AppNavigation,
  type NavigationTransition,
  resolveAppDestinationFromPath,
} from '@/shared/lib/routes/appNavigation';

function destinationToLocalTarget(destination: AppDestination) {
  switch (destination.kind) {
    case 'root':
      return { to: '/' } as const;
    case 'onboarding':
      return { to: '/onboarding' } as const;
    case 'onboarding-sign-in':
      return { to: '/onboarding/sign-in' } as const;
    case 'migrate':
      return { to: '/migrate' } as const;
    case 'workspaces':
      return { to: '/workspaces' } as const;
    case 'workspaces-create':
      return { to: '/workspaces/create' } as const;
    case 'workspace':
      return {
        to: '/workspaces/$workspaceId',
        params: { workspaceId: destination.workspaceId },
      } as const;
    case 'workspace-vscode':
      return {
        to: '/workspaces/$workspaceId/vscode',
        params: { workspaceId: destination.workspaceId },
      } as const;
    case 'project':
      return {
        to: '/projects/$projectId',
        params: { projectId: destination.projectId },
      } as const;
    case 'project-issue-create':
      return {
        to: '/projects/$projectId/issues/new',
        params: { projectId: destination.projectId },
      } as const;
    case 'project-issue':
      return {
        to: '/projects/$projectId/issues/$issueId',
        params: {
          projectId: destination.projectId,
          issueId: destination.issueId,
        },
      } as const;
    case 'project-issue-workspace':
      return {
        to: '/projects/$projectId/issues/$issueId/workspaces/$workspaceId',
        params: {
          projectId: destination.projectId,
          issueId: destination.issueId,
          workspaceId: destination.workspaceId,
        },
      } as const;
    case 'project-issue-workspace-create':
      return {
        to: '/projects/$projectId/issues/$issueId/workspaces/create/$draftId',
        params: {
          projectId: destination.projectId,
          issueId: destination.issueId,
          draftId: destination.draftId,
        },
      } as const;
    case 'project-workspace-create':
      return {
        to: '/projects/$projectId/workspaces/create/$draftId',
        params: {
          projectId: destination.projectId,
          draftId: destination.draftId,
        },
      } as const;
  }
}

export function createLocalAppNavigation(): AppNavigation {
  const navigateTo = (
    destination: AppDestination,
    transition?: NavigationTransition
  ) => {
    void router.navigate({
      ...destinationToLocalTarget(destination),
      ...(transition?.replace !== undefined
        ? { replace: transition.replace }
        : {}),
    });
  };

  const navigation: AppNavigation = {
    navigate: navigateTo,
    resolveFromPath: (path) => resolveAppDestinationFromPath(path),
    goToRoot: (transition) => navigateTo({ kind: 'root' }, transition),
    goToOnboarding: (transition) =>
      navigateTo({ kind: 'onboarding' }, transition),
    goToOnboardingSignIn: (transition) =>
      navigateTo({ kind: 'onboarding-sign-in' }, transition),
    goToMigrate: (transition) => navigateTo({ kind: 'migrate' }, transition),
    goToWorkspaces: (transition) =>
      navigateTo({ kind: 'workspaces' }, transition),
    goToWorkspacesCreate: (transition) =>
      navigateTo({ kind: 'workspaces-create' }, transition),
    goToWorkspace: (workspaceId, transition) =>
      navigateTo({ kind: 'workspace', workspaceId }, transition),
    goToWorkspaceVsCode: (workspaceId, transition) =>
      navigateTo({ kind: 'workspace-vscode', workspaceId }, transition),
    goToProject: (projectId, transition) =>
      navigateTo({ kind: 'project', projectId }, transition),
    goToProjectIssueCreate: (projectId, transition) =>
      navigateTo({ kind: 'project-issue-create', projectId }, transition),
    goToProjectIssue: (projectId, issueId, transition) =>
      navigateTo({ kind: 'project-issue', projectId, issueId }, transition),
    goToProjectIssueWorkspace: (projectId, issueId, workspaceId, transition) =>
      navigateTo(
        { kind: 'project-issue-workspace', projectId, issueId, workspaceId },
        transition
      ),
    goToProjectIssueWorkspaceCreate: (
      projectId,
      issueId,
      draftId,
      transition
    ) =>
      navigateTo(
        { kind: 'project-issue-workspace-create', projectId, issueId, draftId },
        transition
      ),
    goToProjectWorkspaceCreate: (projectId, draftId, transition) =>
      navigateTo(
        { kind: 'project-workspace-create', projectId, draftId },
        transition
      ),
  };

  return navigation;
}

export const localAppNavigation = createLocalAppNavigation();
