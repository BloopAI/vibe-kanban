import { type ReactNode, useEffect, useMemo } from "react";
import {
  createRootRoute,
  Outlet,
  useLocation,
  useParams,
} from "@tanstack/react-router";
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
import { useAuth } from "@/shared/hooks/auth/useAuth";
import { useWorkspaceContext } from "@/shared/hooks/useWorkspaceContext";
import { AppNavigationProvider } from "@/shared/hooks/useAppNavigation";
import {
  createRemoteHostAppNavigation,
  remoteFallbackAppNavigation,
  resolveRemoteDestinationFromPath,
} from "@remote/app/navigation/AppNavigation";
import {
  resolveRelayNavigationHostId,
  useRelayAppBarHosts,
} from "@remote/shared/hooks/useRelayAppBarHosts";
import { setActiveRelayHostId } from "@remote/shared/lib/relay/activeHostContext";
import {
  isProjectDestination,
  isWorkspacesDestination,
} from "@/shared/lib/routes/appNavigation";
import NotFoundPage from "../pages/NotFoundPage";

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});

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
  const { isSignedIn } = useAuth();
  const location = useLocation();
  const { hostId } = useParams({ strict: false });
  const routeHostId = hostId ?? null;
  const { hosts: relayHosts } = useRelayAppBarHosts(isSignedIn);
  const navigationHostId = useMemo(
    () => resolveRelayNavigationHostId(relayHosts, { routeHostId }),
    [relayHosts, routeHostId],
  );

  useEffect(() => {
    setActiveRelayHostId(navigationHostId);
  }, [navigationHostId]);

  const appNavigation = useMemo(
    () =>
      navigationHostId
        ? createRemoteHostAppNavigation(navigationHostId)
        : remoteFallbackAppNavigation,
    [navigationHostId],
  );
  const isStandaloneRoute =
    location.pathname.startsWith("/account") ||
    location.pathname.startsWith("/login") ||
    location.pathname.startsWith("/upgrade") ||
    location.pathname.startsWith("/invitations");
  const destination = resolveRemoteDestinationFromPath(location.pathname);
  const isWorkspaceProviderRoute =
    isProjectDestination(destination) || isWorkspacesDestination(destination);

  const pageContent = isStandaloneRoute ? (
    <Outlet />
  ) : (
    <RemoteAppShell>
      <Outlet />
    </RemoteAppShell>
  );

  const content = isWorkspaceProviderRoute ? (
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
