import { createRootRoute, Outlet } from "@tanstack/react-router";
import { useSystemTheme } from "@/shared/hooks/useSystemTheme";
import NotFoundPage from "../pages/NotFoundPage";

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});

function RootLayout() {
  useSystemTheme();
  return <Outlet />;
}
