import { router } from '@web/app/router';
import {
  type AppDestination,
  type AppNavigation,
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
  const navigation: AppNavigation = {
    navigate: (destination, transition) => {
      void router.navigate({
        ...destinationToLocalTarget(destination),
        ...(transition?.replace !== undefined
          ? { replace: transition.replace }
          : {}),
      });
    },
    resolveFromPath: (path) => resolveAppDestinationFromPath(path),
    toRoot: () => ({ kind: 'root' }),
    toOnboarding: () => ({ kind: 'onboarding' }),
    toOnboardingSignIn: () => ({ kind: 'onboarding-sign-in' }),
    toMigrate: () => ({ kind: 'migrate' }),
    toWorkspaces: () => ({ kind: 'workspaces' }),
    toWorkspacesCreate: () => ({ kind: 'workspaces-create' }),
    toWorkspace: (workspaceId) => ({ kind: 'workspace', workspaceId }),
    toWorkspaceVsCode: (workspaceId) => ({
      kind: 'workspace-vscode',
      workspaceId,
    }),
    toProject: (projectId) => ({
      kind: 'project',
      projectId,
    }),
    toProjectIssueCreate: (projectId) => ({
      kind: 'project-issue-create',
      projectId,
    }),
    toProjectIssue: (projectId, issueId) => ({
      kind: 'project-issue',
      projectId,
      issueId,
    }),
    toProjectIssueWorkspace: (projectId, issueId, workspaceId) => ({
      kind: 'project-issue-workspace',
      projectId,
      issueId,
      workspaceId,
    }),
    toProjectIssueWorkspaceCreate: (projectId, issueId, draftId) => ({
      kind: 'project-issue-workspace-create',
      projectId,
      issueId,
      draftId,
    }),
    toProjectWorkspaceCreate: (projectId, draftId) => ({
      kind: 'project-workspace-create',
      projectId,
      draftId,
    }),
  };

  return navigation;
}

export const localAppNavigation = createLocalAppNavigation();
