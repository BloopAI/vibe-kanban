import { createRootRoute, Outlet, useLocation } from "@tanstack/react-router";
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
  const isAuthRoute = location.pathname.startsWith("/login");

  const content = <Outlet />;

  return (
    <UserProvider>
      <RemoteWorkspaceProvider>
        <RemoteActionsProvider>
          {isAuthRoute ? content : <RemoteAppShell>{content}</RemoteAppShell>}
        </RemoteActionsProvider>
      </RemoteWorkspaceProvider>
    </UserProvider>
  );
}
