import { RouterProvider } from "@tanstack/react-router";
import { router } from "./Router";

export default function AppRouter() {
  return <RouterProvider router={router} />;
}
