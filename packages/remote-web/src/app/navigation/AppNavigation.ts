import { router } from "@remote/app/router";
import {
  type AppDestination,
  type AppNavigation,
  resolveAppDestinationFromPath,
} from "@/shared/lib/routes/appNavigation";

type RemoteRouterState = Parameters<typeof router.navigate>[0] extends {
  state?: infer T;
}
  ? T
  : never;

function destinationToRemoteTarget(
  destination: AppDestination,
  options: { currentHostId: string | null },
) {
  const destinationHostId =
    "hostId" in destination ? (destination.hostId ?? null) : null;
  const effectiveHostId = destinationHostId ?? options.currentHostId;

  switch (destination.kind) {
    case "root":
      return { to: "/" } as const;
    case "onboarding":
      return { to: "/" } as const;
    case "onboarding-sign-in":
      return { to: "/" } as const;
    case "migrate":
      return { to: "/" } as const;
    case "workspaces":
      if (effectiveHostId) {
        return {
          to: "/hosts/$hostId/workspaces",
          params: { hostId: effectiveHostId },
        } as const;
      }
      return { to: "/" } as const;
    case "workspaces-create":
      if (effectiveHostId) {
        return {
          to: "/hosts/$hostId/workspaces/create",
          params: { hostId: effectiveHostId },
        } as const;
      }
      return { to: "/" } as const;
    case "workspace":
      if (effectiveHostId) {
        return {
          to: "/hosts/$hostId/workspaces/$workspaceId",
          params: {
            hostId: effectiveHostId,
            workspaceId: destination.workspaceId,
          },
        } as const;
      }
      return { to: "/" } as const;
    case "workspace-vscode":
      if (effectiveHostId) {
        return {
          to: "/hosts/$hostId/workspaces/$workspaceId/vscode",
          params: {
            hostId: effectiveHostId,
            workspaceId: destination.workspaceId,
          },
        } as const;
      }
      return { to: "/" } as const;
    case "project":
      if (effectiveHostId) {
        return {
          to: "/hosts/$hostId/projects/$projectId",
          params: {
            hostId: effectiveHostId,
            projectId: destination.projectId,
          },
          ...(destination.search ? { search: destination.search } : {}),
        } as const;
      }
      return { to: "/" } as const;
    case "project-issue-create":
      if (effectiveHostId) {
        return {
          to: "/hosts/$hostId/projects/$projectId/issues/new",
          params: {
            hostId: effectiveHostId,
            projectId: destination.projectId,
          },
          ...(destination.search ? { search: destination.search } : {}),
        } as const;
      }
      return { to: "/" } as const;
    case "project-issue":
      if (effectiveHostId) {
        return {
          to: "/hosts/$hostId/projects/$projectId/issues/$issueId",
          params: {
            hostId: effectiveHostId,
            projectId: destination.projectId,
            issueId: destination.issueId,
          },
          ...(destination.search ? { search: destination.search } : {}),
        } as const;
      }
      return { to: "/" } as const;
    case "project-issue-workspace":
      if (effectiveHostId) {
        return {
          to: "/hosts/$hostId/projects/$projectId/issues/$issueId/workspaces/$workspaceId",
          params: {
            hostId: effectiveHostId,
            projectId: destination.projectId,
            issueId: destination.issueId,
            workspaceId: destination.workspaceId,
          },
          ...(destination.search ? { search: destination.search } : {}),
        } as const;
      }
      return { to: "/" } as const;
    case "project-issue-workspace-create":
      if (effectiveHostId) {
        return {
          to: "/hosts/$hostId/projects/$projectId/issues/$issueId/workspaces/create/$draftId",
          params: {
            hostId: effectiveHostId,
            projectId: destination.projectId,
            issueId: destination.issueId,
            draftId: destination.draftId,
          },
          ...(destination.search ? { search: destination.search } : {}),
        } as const;
      }
      return { to: "/" } as const;
    case "project-workspace-create":
      if (effectiveHostId) {
        return {
          to: "/hosts/$hostId/projects/$projectId/workspaces/create/$draftId",
          params: {
            hostId: effectiveHostId,
            projectId: destination.projectId,
            draftId: destination.draftId,
          },
          ...(destination.search ? { search: destination.search } : {}),
        } as const;
      }
      return { to: "/" } as const;
  }
}

export function createRemoteHostAppNavigation(hostId: string): AppNavigation {
  const navigation: AppNavigation = {
    navigate: (destination, transition) => {
      void router.navigate({
        ...destinationToRemoteTarget(destination, {
          currentHostId: hostId,
        }),
        ...(transition?.replace !== undefined
          ? { replace: transition.replace }
          : {}),
        ...(transition?.state !== undefined
          ? { state: transition.state as RemoteRouterState }
          : {}),
      });
    },
    resolveFromPath: (path) => resolveAppDestinationFromPath(path),
    toRoot: () => ({ kind: "root" }),
    toOnboarding: () => ({ kind: "onboarding" }),
    toOnboardingSignIn: () => ({ kind: "onboarding-sign-in" }),
    toMigrate: () => ({ kind: "migrate" }),
    toWorkspaces: () => ({ kind: "workspaces", hostId }),
    toWorkspacesCreate: () => ({ kind: "workspaces-create", hostId }),
    toWorkspace: (workspaceId) => ({ kind: "workspace", hostId, workspaceId }),
    toWorkspaceVsCode: (workspaceId) => ({
      kind: "workspace-vscode",
      hostId,
      workspaceId,
    }),
    toProject: (projectId, search) => ({
      kind: "project",
      hostId,
      projectId,
      ...(search ? { search } : {}),
    }),
    toProjectIssueCreate: (projectId, search) => ({
      kind: "project-issue-create",
      hostId,
      projectId,
      ...(search ? { search } : {}),
    }),
    toProjectIssue: (projectId, issueId, search) => ({
      kind: "project-issue",
      hostId,
      projectId,
      issueId,
      ...(search ? { search } : {}),
    }),
    toProjectIssueWorkspace: (projectId, issueId, workspaceId, search) => ({
      kind: "project-issue-workspace",
      hostId,
      projectId,
      issueId,
      workspaceId,
      ...(search ? { search } : {}),
    }),
    toProjectIssueWorkspaceCreate: (projectId, issueId, draftId, search) => ({
      kind: "project-issue-workspace-create",
      hostId,
      projectId,
      issueId,
      draftId,
      ...(search ? { search } : {}),
    }),
    toProjectWorkspaceCreate: (projectId, draftId, search) => ({
      kind: "project-workspace-create",
      hostId,
      projectId,
      draftId,
      ...(search ? { search } : {}),
    }),
  };

  return navigation;
}

function createRemoteFallbackAppNavigation(): AppNavigation {
  const navigation: AppNavigation = {
    navigate: (destination, transition) => {
      void router.navigate({
        ...destinationToRemoteTarget(destination, {
          currentHostId: null,
        }),
        ...(transition?.replace !== undefined
          ? { replace: transition.replace }
          : {}),
        ...(transition?.state !== undefined
          ? { state: transition.state as RemoteRouterState }
          : {}),
      });
    },
    resolveFromPath: (path) => resolveAppDestinationFromPath(path),
    toRoot: () => ({ kind: "root" }),
    toOnboarding: () => ({ kind: "onboarding" }),
    toOnboardingSignIn: () => ({ kind: "onboarding-sign-in" }),
    toMigrate: () => ({ kind: "migrate" }),
    toWorkspaces: () => ({ kind: "workspaces" }),
    toWorkspacesCreate: () => ({ kind: "workspaces-create" }),
    toWorkspace: (workspaceId) => ({ kind: "workspace", workspaceId }),
    toWorkspaceVsCode: (workspaceId) => ({
      kind: "workspace-vscode",
      workspaceId,
    }),
    toProject: (projectId, search) => ({
      kind: "project",
      projectId,
      ...(search ? { search } : {}),
    }),
    toProjectIssueCreate: (projectId, search) => ({
      kind: "project-issue-create",
      projectId,
      ...(search ? { search } : {}),
    }),
    toProjectIssue: (projectId, issueId, search) => ({
      kind: "project-issue",
      projectId,
      issueId,
      ...(search ? { search } : {}),
    }),
    toProjectIssueWorkspace: (projectId, issueId, workspaceId, search) => ({
      kind: "project-issue-workspace",
      projectId,
      issueId,
      workspaceId,
      ...(search ? { search } : {}),
    }),
    toProjectIssueWorkspaceCreate: (projectId, issueId, draftId, search) => ({
      kind: "project-issue-workspace-create",
      projectId,
      issueId,
      draftId,
      ...(search ? { search } : {}),
    }),
    toProjectWorkspaceCreate: (projectId, draftId, search) => ({
      kind: "project-workspace-create",
      projectId,
      draftId,
      ...(search ? { search } : {}),
    }),
  };

  return navigation;
}

export const remoteFallbackAppNavigation = createRemoteFallbackAppNavigation();
