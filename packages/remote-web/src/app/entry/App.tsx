import { RouterProvider } from "@tanstack/react-router";
import { HotkeysProvider } from "react-hotkeys-hook";
import { router } from "@remote/app/router";
import { AppRuntimeProvider } from "@/shared/hooks/useAppRuntime";

export function AppRouter() {
  return (
    <AppRuntimeProvider runtime="remote">
      <HotkeysProvider
        initiallyActiveScopes={["global", "workspace", "kanban", "projects"]}
      >
        <RouterProvider router={router} />
      </HotkeysProvider>
    </AppRuntimeProvider>
  );
}
