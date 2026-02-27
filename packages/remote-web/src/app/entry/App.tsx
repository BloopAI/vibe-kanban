import { RouterProvider } from "@tanstack/react-router";
import { router } from "@remote/app/router";
import { AppRuntimeProvider } from "@/shared/hooks/useAppRuntime";

export function AppRouter() {
  return (
    <AppRuntimeProvider runtime="remote">
      <RouterProvider router={router} />
    </AppRuntimeProvider>
  );
}
