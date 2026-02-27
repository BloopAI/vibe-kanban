import { createFileRoute } from "@tanstack/react-router";
import { requireAuthenticated } from "@remote/shared/lib/route-auth";
import { projectSearchValidator } from "@vibe/web-core/project-search";
import { RemoteProjectKanbanShell } from "@remote/pages/RemoteProjectKanbanShell";

export const Route = createFileRoute(
  "/projects/$projectId_/workspaces/create/$draftId",
)({
  beforeLoad: async ({ location }) => {
    await requireAuthenticated(location);
  },
  validateSearch: projectSearchValidator,
  component: RemoteProjectKanbanShell,
});
