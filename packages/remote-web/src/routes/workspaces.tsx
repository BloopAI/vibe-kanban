import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { requireAuthenticated } from "@remote/shared/lib/route-auth";
import { WorkspacesLanding } from "@/pages/workspaces/WorkspacesLanding";
import { RemoteWorkspacesPageShell } from "@remote/pages/RemoteWorkspacesPageShell";

const searchSchema = z.object({
  hostId: z.string().optional(),
});

export const Route = createFileRoute("/workspaces")({
  validateSearch: zodValidator(searchSchema),
  beforeLoad: async ({ location }) => {
    await requireAuthenticated(location);
  },
  component: WorkspacesRouteComponent,
});

function WorkspacesRouteComponent() {
  return (
    <RemoteWorkspacesPageShell>
      <WorkspacesLanding />
    </RemoteWorkspacesPageShell>
  );
}
