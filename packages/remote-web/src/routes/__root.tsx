import { type ReactNode, useMemo } from "react";
import { createRootRoute, Outlet, useLocation } from "@tanstack/react-router";
import { Provider as NiceModalProvider } from "@ebay/nice-modal-react";
import { useSystemTheme } from "@remote/shared/hooks/useSystemTheme";
import { RemoteActionsProvider } from "@remote/app/providers/RemoteActionsProvider";
import { RemoteUserSystemProvider } from "@remote/app/providers/RemoteUserSystemProvider";
import { RemoteAppShell } from "@remote/app/layout/RemoteAppShell";
import { UserProvider } from "@/shared/providers/remote/UserProvider";
import { WorkspaceProvider } from "@/shared/providers/WorkspaceProvider";
import { ExecutionProcessesProvider } from "@/shared/providers/ExecutionProcessesProvider";
import { TerminalProvider } from "@/shared/providers/TerminalProvider";
import { LogsPanelProvider } from "@/shared/providers/LogsPanelProvider";
import { ActionsProvider } from "@/shared/providers/ActionsProvider";
import { useWorkspaceContext } from "@/shared/hooks/useWorkspaceContext";
import { AppNavigationProvider } from "@/shared/hooks/useAppNavigation";
import {
  type AppNavigation,
  type ProjectKanbanSearch,
  createRemoteAppNavigation,
} from "@/shared/lib/routes/appNavigation";
import { parseAppPathname } from "@/shared/lib/routes/pathResolution";
import NotFoundPage from "../pages/NotFoundPage";

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});

function createRemoteFallbackNavigation(): AppNavigation {
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
    toProject: (projectId, search?: ProjectKanbanSearch) =>
      ({
        to: "/projects/$projectId",
        params: { projectId },
        ...(search ? { search } : {}),
      }) as any,
    toProjectIssueCreate: (projectId, search?: ProjectKanbanSearch) =>
      ({
        to: "/projects/$projectId/issues/new",
        params: { projectId },
        ...(search ? { search } : {}),
      }) as any,
    toProjectIssue: (projectId, issueId, search?: ProjectKanbanSearch) =>
      ({
        to: "/projects/$projectId/issues/$issueId",
        params: { projectId, issueId },
        ...(search ? { search } : {}),
      }) as any,
    toProjectIssueWorkspace: (
      projectId,
      issueId,
      workspaceId,
      search?: ProjectKanbanSearch,
    ) =>
      ({
        to: "/projects/$projectId/issues/$issueId/workspaces/$workspaceId",
        params: { projectId, issueId, workspaceId },
        ...(search ? { search } : {}),
      }) as any,
    toProjectIssueWorkspaceCreate: (
      projectId,
      issueId,
      draftId,
      search?: ProjectKanbanSearch,
    ) =>
      ({
        to: "/projects/$projectId/issues/$issueId/workspaces/create/$draftId",
        params: { projectId, issueId, draftId },
        ...(search ? { search } : {}),
      }) as any,
    toProjectWorkspaceCreate: (
      projectId,
      draftId,
      search?: ProjectKanbanSearch,
    ) =>
      ({
        to: "/projects/$projectId/workspaces/create/$draftId",
        params: { projectId, draftId },
        ...(search ? { search } : {}),
      }) as any,
    fromPath: (path) => {
      const { hostId: nextHostId } = parseAppPathname(
        new URL(path, "http://localhost").pathname,
      );
      if (nextHostId) {
        return createRemoteAppNavigation(nextHostId).fromPath(path);
      }
      return navigation.toRoot();
    },
  };

  return navigation;
}

const remoteFallbackNavigation = createRemoteFallbackNavigation();

function ExecutionProcessesProviderWrapper({
  children,
}: {
  children: ReactNode;
}) {
  const { selectedSessionId } = useWorkspaceContext();

  return (
    <ExecutionProcessesProvider sessionId={selectedSessionId}>
      {children}
    </ExecutionProcessesProvider>
  );
}

function WorkspaceRouteProviders({ children }: { children: ReactNode }) {
  return (
    <WorkspaceProvider>
      <ExecutionProcessesProviderWrapper>
        <TerminalProvider>
          <LogsPanelProvider>
            <ActionsProvider>{children}</ActionsProvider>
          </LogsPanelProvider>
        </TerminalProvider>
      </ExecutionProcessesProviderWrapper>
    </WorkspaceProvider>
  );
}

function RootLayout() {
  useSystemTheme();
  const location = useLocation();
  const { hostId } = parseAppPathname(location.pathname);
  const appNavigation = useMemo(
    () =>
      hostId ? createRemoteAppNavigation(hostId) : remoteFallbackNavigation,
    [hostId],
  );
  const isStandaloneRoute =
    location.pathname.startsWith("/account") ||
    location.pathname.startsWith("/login") ||
    location.pathname.startsWith("/upgrade") ||
    location.pathname.startsWith("/invitations");
  const isHostScopedRoute = location.pathname.startsWith("/hosts/");

  const pageContent = isStandaloneRoute ? (
    <Outlet />
  ) : (
    <RemoteAppShell>
      <Outlet />
    </RemoteAppShell>
  );

  const content = isHostScopedRoute ? (
    <WorkspaceRouteProviders>
      <NiceModalProvider>{pageContent}</NiceModalProvider>
    </WorkspaceRouteProviders>
  ) : (
    <NiceModalProvider>{pageContent}</NiceModalProvider>
  );

  return (
    <AppNavigationProvider value={appNavigation}>
      <UserProvider>
        <RemoteActionsProvider>
          <RemoteUserSystemProvider>{content}</RemoteUserSystemProvider>
        </RemoteActionsProvider>
      </UserProvider>
    </AppNavigationProvider>
  );
}
