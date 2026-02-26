import { createFileRoute } from "@tanstack/react-router";
import { requireAuthenticated } from "@remote/shared/lib/route-auth";
import { VSCodeWorkspacePage } from "@/pages/workspaces/VSCodeWorkspacePage";
import { RemoteWorkspacesPageShell } from "@remote/pages/RemoteWorkspacesPageShell";

export const Route = createFileRoute("/workspaces/$workspaceId/vscode")({
  beforeLoad: async ({ location }) => {
    await requireAuthenticated(location);
  },
  component: WorkspaceVSCodeRouteComponent,
});

function WorkspaceVSCodeRouteComponent() {
  return (
    <RemoteWorkspacesPageShell>
      <VSCodeWorkspacePage />
    </RemoteWorkspacesPageShell>
  );
}
