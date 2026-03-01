import {
  type AppNavigation,
  resolveAppNavigationFromPath,
} from "@/shared/lib/routes/appNavigation";

export function createRemoteHostAppNavigation(hostId: string): AppNavigation {
  const navigation: AppNavigation = {
    toRoot: () => ({ to: "/" }) as any,
    toOnboarding: () => ({ to: "/onboarding" }) as any,
    toOnboardingSignIn: () => ({ to: "/onboarding/sign-in" }) as any,
    toMigrate: () => ({ to: "/migrate" }) as any,
    toWorkspaces: () => ({
      to: "/hosts/$hostId/workspaces",
      params: { hostId },
    }),
    toWorkspacesCreate: () => ({
      to: "/hosts/$hostId/workspaces/create",
      params: { hostId },
    }),
    toWorkspace: (workspaceId) =>
      ({
        to: "/hosts/$hostId/workspaces/$workspaceId",
        params: { hostId, workspaceId },
      }) as any,
    toWorkspaceVsCode: (workspaceId) =>
      ({
        to: "/hosts/$hostId/workspaces/$workspaceId/vscode",
        params: { hostId, workspaceId },
      }) as any,
    toProject: (projectId, search) =>
      ({
        to: "/hosts/$hostId/projects/$projectId",
        params: { hostId, projectId },
        ...(search ? { search } : {}),
      }) as any,
    toProjectIssueCreate: (projectId, search) =>
      ({
        to: "/hosts/$hostId/projects/$projectId/issues/new",
        params: { hostId, projectId },
        ...(search ? { search } : {}),
      }) as any,
    toProjectIssue: (projectId, issueId, search) =>
      ({
        to: "/hosts/$hostId/projects/$projectId/issues/$issueId",
        params: { hostId, projectId, issueId },
        ...(search ? { search } : {}),
      }) as any,
    toProjectIssueWorkspace: (projectId, issueId, workspaceId, search) =>
      ({
        to: "/hosts/$hostId/projects/$projectId/issues/$issueId/workspaces/$workspaceId",
        params: { hostId, projectId, issueId, workspaceId },
        ...(search ? { search } : {}),
      }) as any,
    toProjectIssueWorkspaceCreate: (projectId, issueId, draftId, search) =>
      ({
        to: "/hosts/$hostId/projects/$projectId/issues/$issueId/workspaces/create/$draftId",
        params: { hostId, projectId, issueId, draftId },
        ...(search ? { search } : {}),
      }) as any,
    toProjectWorkspaceCreate: (projectId, draftId, search) =>
      ({
        to: "/hosts/$hostId/projects/$projectId/workspaces/create/$draftId",
        params: { hostId, projectId, draftId },
        ...(search ? { search } : {}),
      }) as any,
    fromPath: (path) =>
      resolveAppNavigationFromPath(path, navigation, {
        resolveHostNavigation: (nextHostId) =>
          nextHostId === hostId
            ? navigation
            : createRemoteHostAppNavigation(nextHostId),
      }),
  };

  return navigation;
}

function createRemoteFallbackAppNavigation(): AppNavigation {
  const navigation: AppNavigation = {
    toRoot: () => ({ to: "/" }) as any,
    toOnboarding: () => ({ to: "/onboarding" }) as any,
    toOnboardingSignIn: () => ({ to: "/onboarding/sign-in" }) as any,
    toMigrate: () => ({ to: "/migrate" }) as any,
    toWorkspaces: () => ({ to: "/workspaces" }) as any,
    toWorkspacesCreate: () => ({ to: "/workspaces/create" }) as any,
    toWorkspace: (workspaceId) =>
      ({ to: "/workspaces/$workspaceId", params: { workspaceId } }) as any,
    toWorkspaceVsCode: (workspaceId) =>
      ({
        to: "/workspaces/$workspaceId/vscode",
        params: { workspaceId },
      }) as any,
    toProject: (projectId, search) =>
      ({
        to: "/projects/$projectId",
        params: { projectId },
        ...(search ? { search } : {}),
      }) as any,
    toProjectIssueCreate: (projectId, search) =>
      ({
        to: "/projects/$projectId/issues/new",
        params: { projectId },
        ...(search ? { search } : {}),
      }) as any,
    toProjectIssue: (projectId, issueId, search) =>
      ({
        to: "/projects/$projectId/issues/$issueId",
        params: { projectId, issueId },
        ...(search ? { search } : {}),
      }) as any,
    toProjectIssueWorkspace: (projectId, issueId, workspaceId, search) =>
      ({
        to: "/projects/$projectId/issues/$issueId/workspaces/$workspaceId",
        params: { projectId, issueId, workspaceId },
        ...(search ? { search } : {}),
      }) as any,
    toProjectIssueWorkspaceCreate: (projectId, issueId, draftId, search) =>
      ({
        to: "/projects/$projectId/issues/$issueId/workspaces/create/$draftId",
        params: { projectId, issueId, draftId },
        ...(search ? { search } : {}),
      }) as any,
    toProjectWorkspaceCreate: (projectId, draftId, search) =>
      ({
        to: "/projects/$projectId/workspaces/create/$draftId",
        params: { projectId, draftId },
        ...(search ? { search } : {}),
      }) as any,
    fromPath: (path) =>
      resolveAppNavigationFromPath(path, navigation, {
        resolveHostNavigation: (nextHostId) =>
          createRemoteHostAppNavigation(nextHostId),
      }),
  };

  return navigation;
}

export const remoteFallbackAppNavigation = createRemoteFallbackAppNavigation();
