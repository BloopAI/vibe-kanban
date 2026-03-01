import { router } from "@remote/app/router";
import {
  type AppDestination,
  type AppNavigation,
  type NavigationTransition,
  resolveAppDestinationFromPath,
} from "@/shared/lib/routes/appNavigation";

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
        } as const;
      }
      return { to: "/" } as const;
  }
}

export function createRemoteHostAppNavigation(hostId: string): AppNavigation {
  const navigateTo = (
    destination: AppDestination,
    transition?: NavigationTransition,
  ) => {
    void router.navigate({
      ...destinationToRemoteTarget(destination, {
        currentHostId: hostId,
      }),
      ...(transition?.replace !== undefined
        ? { replace: transition.replace }
        : {}),
    });
  };

  const navigation: AppNavigation = {
    resolveFromPath: (path) => resolveAppDestinationFromPath(path),
    goToRoot: (transition) => navigateTo({ kind: "root" }, transition),
    goToOnboarding: (transition) =>
      navigateTo({ kind: "onboarding" }, transition),
    goToOnboardingSignIn: (transition) =>
      navigateTo({ kind: "onboarding-sign-in" }, transition),
    goToMigrate: (transition) => navigateTo({ kind: "migrate" }, transition),
    goToWorkspaces: (transition) =>
      navigateTo({ kind: "workspaces", hostId }, transition),
    goToWorkspacesCreate: (transition) =>
      navigateTo({ kind: "workspaces-create", hostId }, transition),
    goToWorkspace: (workspaceId, transition) =>
      navigateTo({ kind: "workspace", hostId, workspaceId }, transition),
    goToWorkspaceVsCode: (workspaceId, transition) =>
      navigateTo({ kind: "workspace-vscode", hostId, workspaceId }, transition),
    goToProject: (projectId, transition) =>
      navigateTo({ kind: "project", hostId, projectId }, transition),
    goToProjectIssueCreate: (projectId, transition) =>
      navigateTo(
        { kind: "project-issue-create", hostId, projectId },
        transition,
      ),
    goToProjectIssue: (projectId, issueId, transition) =>
      navigateTo(
        { kind: "project-issue", hostId, projectId, issueId },
        transition,
      ),
    goToProjectIssueWorkspace: (projectId, issueId, workspaceId, transition) =>
      navigateTo(
        {
          kind: "project-issue-workspace",
          hostId,
          projectId,
          issueId,
          workspaceId,
        },
        transition,
      ),
    goToProjectIssueWorkspaceCreate: (
      projectId,
      issueId,
      draftId,
      transition,
    ) =>
      navigateTo(
        {
          kind: "project-issue-workspace-create",
          hostId,
          projectId,
          issueId,
          draftId,
        },
        transition,
      ),
    goToProjectWorkspaceCreate: (projectId, draftId, transition) =>
      navigateTo(
        { kind: "project-workspace-create", hostId, projectId, draftId },
        transition,
      ),
  };

  return navigation;
}

function createRemoteFallbackAppNavigation(): AppNavigation {
  const navigateTo = (
    destination: AppDestination,
    transition?: NavigationTransition,
  ) => {
    void router.navigate({
      ...destinationToRemoteTarget(destination, {
        currentHostId: null,
      }),
      ...(transition?.replace !== undefined
        ? { replace: transition.replace }
        : {}),
    });
  };

  const navigation: AppNavigation = {
    resolveFromPath: (path) => resolveAppDestinationFromPath(path),
    goToRoot: (transition) => navigateTo({ kind: "root" }, transition),
    goToOnboarding: (transition) =>
      navigateTo({ kind: "onboarding" }, transition),
    goToOnboardingSignIn: (transition) =>
      navigateTo({ kind: "onboarding-sign-in" }, transition),
    goToMigrate: (transition) => navigateTo({ kind: "migrate" }, transition),
    goToWorkspaces: (transition) =>
      navigateTo({ kind: "workspaces" }, transition),
    goToWorkspacesCreate: (transition) =>
      navigateTo({ kind: "workspaces-create" }, transition),
    goToWorkspace: (workspaceId, transition) =>
      navigateTo({ kind: "workspace", workspaceId }, transition),
    goToWorkspaceVsCode: (workspaceId, transition) =>
      navigateTo({ kind: "workspace-vscode", workspaceId }, transition),
    goToProject: (projectId, transition) =>
      navigateTo({ kind: "project", projectId }, transition),
    goToProjectIssueCreate: (projectId, transition) =>
      navigateTo({ kind: "project-issue-create", projectId }, transition),
    goToProjectIssue: (projectId, issueId, transition) =>
      navigateTo({ kind: "project-issue", projectId, issueId }, transition),
    goToProjectIssueWorkspace: (projectId, issueId, workspaceId, transition) =>
      navigateTo(
        { kind: "project-issue-workspace", projectId, issueId, workspaceId },
        transition,
      ),
    goToProjectIssueWorkspaceCreate: (
      projectId,
      issueId,
      draftId,
      transition,
    ) =>
      navigateTo(
        { kind: "project-issue-workspace-create", projectId, issueId, draftId },
        transition,
      ),
    goToProjectWorkspaceCreate: (projectId, draftId, transition) =>
      navigateTo(
        { kind: "project-workspace-create", projectId, draftId },
        transition,
      ),
  };

  return navigation;
}

export const remoteFallbackAppNavigation = createRemoteFallbackAppNavigation();
