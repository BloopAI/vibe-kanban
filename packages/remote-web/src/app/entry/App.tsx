import { RouterProvider } from "@tanstack/react-router";
import { router } from "@/app/router";

export function AppRouter() {
  return <RouterProvider router={router} />;
}
