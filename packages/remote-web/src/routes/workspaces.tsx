import { createFileRoute } from "@tanstack/react-router";
import WorkspacesUnavailablePage from "@remote/pages/WorkspacesUnavailablePage";
import { requireAuthenticated } from "@remote/shared/lib/route-auth";

export const Route = createFileRoute("/workspaces")({
  beforeLoad: async ({ location }) => {
    await requireAuthenticated(location);
  },
  component: WorkspacesUnavailablePage,
});
