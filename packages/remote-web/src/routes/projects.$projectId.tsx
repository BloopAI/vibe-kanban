import { createFileRoute } from "@tanstack/react-router";
import { requireAuthenticated } from "@remote/shared/lib/route-auth";
import { ProjectKanban } from "@/pages/kanban/ProjectKanban";
import { projectSearchValidator } from "@vibe/web-core/project-search";

export const Route = createFileRoute("/projects/$projectId")({
  beforeLoad: async ({ location }) => {
    await requireAuthenticated(location);
  },
  validateSearch: projectSearchValidator,
  component: ProjectKanban,
});
