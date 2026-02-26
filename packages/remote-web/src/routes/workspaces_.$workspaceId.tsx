import { createFileRoute } from "@tanstack/react-router";
import { requireAuthenticated } from "@remote/shared/lib/route-auth";
import { Workspaces } from "@/pages/workspaces/Workspaces";
import { RemoteWorkspacesPageShell } from "@remote/pages/RemoteWorkspacesPageShell";

export const Route = createFileRoute("/workspaces_/$workspaceId")({
  beforeLoad: async ({ location }) => {
    await requireAuthenticated(location);
  },
  component: WorkspaceRouteComponent,
});

function WorkspaceRouteComponent() {
  return (
    <RemoteWorkspacesPageShell>
      <Workspaces />
    </RemoteWorkspacesPageShell>
  );
}
