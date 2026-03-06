import { router } from "@remote/app/router";
import type { FileRouteTypes } from "@remote/routeTree.gen";
import {
  type AppDestination,
  type AppNavigation,
  type NavigationTransition,
} from "@/shared/lib/routes/appNavigation";

type RemoteRouteId = FileRouteTypes["id"];

function getPathParam(
  routeParams: Record<string, string>,
  key: string,
): string | null {
  const value = routeParams[key];
  return value ? value : null;
}

export function resolveRemoteDestinationFromPath(
  path: string,
): AppDestination | null {
  const { pathname } = new URL(path, "http://localhost");
  const { foundRoute, routeParams } = router.getMatchedRoutes(pathname);

  if (!foundRoute) {
    return null;
  }

  switch (foundRoute.id as RemoteRouteId) {
    case "/":
      return { kind: "root" };
    case "/hosts/$hostId/workspaces": {
      const hostId = getPathParam(routeParams, "hostId");
      return hostId ? { kind: "workspaces", hostId } : null;
    }
    case "/hosts/$hostId/workspaces_/create": {
      const hostId = getPathParam(routeParams, "hostId");
      return hostId ? { kind: "workspaces-create", hostId } : null;
    }
    case "/hosts/$hostId/workspaces_/$workspaceId": {
      const hostId = getPathParam(routeParams, "hostId");
      const workspaceId = getPathParam(routeParams, "workspaceId");
      return hostId && workspaceId
        ? { kind: "workspace", hostId, workspaceId }
        : null;
    }
    case "/hosts/$hostId/workspaces/$workspaceId/vscode": {
      const hostId = getPathParam(routeParams, "hostId");
      const workspaceId = getPathParam(routeParams, "workspaceId");
      return hostId && workspaceId
        ? { kind: "workspace-vscode", hostId, workspaceId }
        : null;
    }
    case "/projects/$projectId": {
      const projectId = getPathParam(routeParams, "projectId");
      return projectId ? { kind: "project", projectId } : null;
    }
    case "/projects/$projectId_/issues/$issueId": {
      const projectId = getPathParam(routeParams, "projectId");
      const issueId = getPathParam(routeParams, "issueId");
      return projectId && issueId
        ? { kind: "project-issue", projectId, issueId }
        : null;
    }
    case "/projects/$projectId_/issues/$issueId_/hosts/$hostId/workspaces/$workspaceId": {
      const projectId = getPathParam(routeParams, "projectId");
      const issueId = getPathParam(routeParams, "issueId");
      const hostId = getPathParam(routeParams, "hostId");
      const workspaceId = getPathParam(routeParams, "workspaceId");
      return projectId && issueId && hostId && workspaceId
        ? {
            kind: "project-issue-workspace",
            projectId,
            issueId,
            hostId,
            workspaceId,
          }
        : null;
    }
    case "/projects/$projectId_/issues/$issueId_/hosts/$hostId/workspaces/create/$draftId": {
      const projectId = getPathParam(routeParams, "projectId");
      const issueId = getPathParam(routeParams, "issueId");
      const hostId = getPathParam(routeParams, "hostId");
      const draftId = getPathParam(routeParams, "draftId");
      return projectId && issueId && hostId && draftId
        ? {
            kind: "project-issue-workspace-create",
            projectId,
            issueId,
            hostId,
            draftId,
          }
        : null;
    }
    case "/projects/$projectId_/hosts/$hostId/workspaces/create/$draftId": {
      const projectId = getPathParam(routeParams, "projectId");
      const hostId = getPathParam(routeParams, "hostId");
      const draftId = getPathParam(routeParams, "draftId");
      return projectId && hostId && draftId
        ? {
            kind: "project-workspace-create",
            projectId,
            hostId,
            draftId,
          }
        : null;
    }
    default:
      return null;
  }
}

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
      return {
        to: "/projects/$projectId",
        params: { projectId: destination.projectId },
      } as const;
    case "project-issue":
      return {
        to: "/projects/$projectId/issues/$issueId",
        params: {
          projectId: destination.projectId,
          issueId: destination.issueId,
        },
      } as const;
    case "project-issue-workspace":
      return {
        to: "/projects/$projectId/issues/$issueId/hosts/$hostId/workspaces/$workspaceId",
        params: {
          projectId: destination.projectId,
          issueId: destination.issueId,
          hostId: destination.hostId,
          workspaceId: destination.workspaceId,
        },
      } as const;
    case "project-issue-workspace-create":
      return {
        to: "/projects/$projectId/issues/$issueId/hosts/$hostId/workspaces/create/$draftId",
        params: {
          projectId: destination.projectId,
          issueId: destination.issueId,
          hostId: destination.hostId,
          draftId: destination.draftId,
        },
      } as const;
    case "project-workspace-create":
      return {
        to: "/projects/$projectId/hosts/$hostId/workspaces/create/$draftId",
        params: {
          projectId: destination.projectId,
          hostId: destination.hostId,
          draftId: destination.draftId,
        },
      } as const;
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
    resolveFromPath: (path) => resolveRemoteDestinationFromPath(path),
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
      navigateTo({ kind: "project", projectId }, transition),
    goToProjectIssue: (projectId, issueId, transition) =>
      navigateTo({ kind: "project-issue", projectId, issueId }, transition),
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
    resolveFromPath: (path) => resolveRemoteDestinationFromPath(path),
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
