import { createRootRoute, Outlet, useLocation } from "@tanstack/react-router";
import { Provider as NiceModalProvider } from "@ebay/nice-modal-react";
import { useSystemTheme } from "@remote/shared/hooks/useSystemTheme";
import { RemoteActionsProvider } from "@remote/app/providers/RemoteActionsProvider";
import { RemoteWorkspaceProvider } from "@remote/app/providers/RemoteWorkspaceProvider";
import { RemoteAppShell } from "@remote/app/layout/RemoteAppShell";
import { UserProvider } from "@/shared/providers/remote/UserProvider";
import NotFoundPage from "../pages/NotFoundPage";

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});

function RootLayout() {
  useSystemTheme();
  const location = useLocation();
  const isStandaloneRoute =
    location.pathname.startsWith("/account") ||
    location.pathname.startsWith("/login") ||
    location.pathname.startsWith("/upgrade") ||
    location.pathname.startsWith("/invitations");

  const content = <Outlet />;

  return (
    <UserProvider>
      <RemoteWorkspaceProvider>
        <RemoteActionsProvider>
          <NiceModalProvider>
            {isStandaloneRoute ? (
              content
            ) : (
              <RemoteAppShell>{content}</RemoteAppShell>
            )}
          </NiceModalProvider>
        </RemoteActionsProvider>
      </RemoteWorkspaceProvider>
    </UserProvider>
  );
}
