import { RouterProvider } from "@tanstack/react-router";
import { HotkeysProvider } from "react-hotkeys-hook";
import { router } from "@remote/app/router";
import { AppRuntimeProvider } from "@/shared/hooks/useAppRuntime";
import { CloudAvailabilityProvider } from "@/shared/hooks/useCloudAvailability";

// The remote web app is served by the cloud itself, so both are always there.
const REMOTE_CLOUD_AVAILABILITY = { cloud: true, relay: true };

export function AppRouter() {
  return (
    <AppRuntimeProvider runtime="remote">
      <CloudAvailabilityProvider value={REMOTE_CLOUD_AVAILABILITY}>
        <HotkeysProvider
          initiallyActiveScopes={["global", "workspace", "kanban", "projects"]}
        >
          <RouterProvider router={router} />
        </HotkeysProvider>
      </CloudAvailabilityProvider>
    </AppRuntimeProvider>
  );
}
