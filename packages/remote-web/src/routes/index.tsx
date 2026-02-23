import { createFileRoute } from "@tanstack/react-router";
import { requireAuthenticated } from "@remote/shared/lib/route-auth";
import HomePage from "../pages/HomePage";

export const Route = createFileRoute("/")({
  beforeLoad: async ({ location }) => {
    await requireAuthenticated(location);
  },
  component: HomePage,
});
