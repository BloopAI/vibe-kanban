import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { requireAuthenticated } from "@remote/shared/lib/route-auth";
import { WorkspacesLanding } from "@/pages/workspaces/WorkspacesLanding";
import { RemoteWorkspacesPageShell } from "@remote/pages/RemoteWorkspacesPageShell";
import { useIsMobile } from "@/shared/hooks/useIsMobile";
import { useWorkspaceContext } from "@/shared/hooks/useWorkspaceContext";
import { cn } from "@/shared/lib/utils";
import { PlusIcon, GitBranchIcon } from "@phosphor-icons/react";

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
  const isMobile = useIsMobile();
  return (
    <RemoteWorkspacesPageShell>
      {isMobile ? <MobileWorkspacesList /> : <WorkspacesLanding />}
    </RemoteWorkspacesPageShell>
  );
}

function MobileWorkspacesList() {
  const navigate = useNavigate();
  const { activeWorkspaces, selectWorkspace } = useWorkspaceContext();

  const handleSelectWorkspace = (id: string) => {
    selectWorkspace(id);
    navigate({ to: "/workspaces/$workspaceId", params: { workspaceId: id } });
  };

  const handleCreateWorkspace = () => {
    navigate({ to: "/workspaces/create" });
  };

  return (
    <div className="flex flex-col h-full bg-primary">
      {/* Header */}
      <div className="flex items-center justify-between px-base py-base border-b border-border">
        <h1 className="text-lg font-semibold text-high">Workspaces</h1>
        <button
          onClick={handleCreateWorkspace}
          className={cn(
            "flex items-center gap-1 rounded-md px-3 py-1.5",
            "bg-brand text-on-brand text-sm font-medium",
            "active:opacity-80 transition-opacity",
          )}
        >
          <PlusIcon className="size-4" />
          New
        </button>
      </div>

      {/* Workspace list */}
      <div className="flex-1 overflow-y-auto">
        {activeWorkspaces.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-double text-center">
            <p className="text-low text-sm">No workspaces yet</p>
            <button
              onClick={handleCreateWorkspace}
              className="mt-base text-brand text-sm font-medium active:opacity-80"
            >
              Create your first workspace
            </button>
          </div>
        ) : (
          <div className="flex flex-col">
            {activeWorkspaces.map((workspace) => (
              <button
                key={workspace.id}
                onClick={() => handleSelectWorkspace(workspace.id)}
                className={cn(
                  "flex flex-col gap-1 px-base py-3",
                  "border-b border-border",
                  "text-left active:bg-secondary transition-colors",
                )}
              >
                <span className="text-sm font-medium text-high truncate">
                  {workspace.name}
                </span>
                {workspace.branch && (
                  <span className="flex items-center gap-1 text-xs text-low">
                    <GitBranchIcon className="size-3 shrink-0" />
                    <span className="truncate">{workspace.branch}</span>
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
