import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { requireAuthenticated } from "@remote/shared/lib/route-auth";
import { WorkspacesLanding } from "@/pages/workspaces/WorkspacesLanding";
import { RemoteWorkspacesPageShell } from "@remote/pages/RemoteWorkspacesPageShell";
import { useIsMobile } from "@/shared/hooks/useIsMobile";
import { useWorkspaceContext } from "@/shared/hooks/useWorkspaceContext";
import { cn } from "@/shared/lib/utils";
import {
  PlusIcon,
  GitBranchIcon,
  HandIcon,
  TriangleIcon,
  PlayIcon,
  FileIcon,
  CircleIcon,
  GitPullRequestIcon,
  PushPinIcon,
} from "@phosphor-icons/react";
import { RunningDots } from "@vibe/ui/components/RunningDots";

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
            "flex items-center gap-half rounded-md px-plusfifty py-half",
            "bg-brand text-on-brand text-sm font-medium",
            "active:opacity-80 transition-opacity",
          )}
        >
          <PlusIcon className="size-icon-sm" />
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
            {activeWorkspaces.map((workspace) => {
              const isFailed =
                workspace.latestProcessStatus === "failed" ||
                workspace.latestProcessStatus === "killed";
              const hasChanges =
                workspace.filesChanged !== undefined &&
                workspace.filesChanged > 0;

              return (
                <button
                  key={workspace.id}
                  onClick={() => handleSelectWorkspace(workspace.id)}
                  className={cn(
                    "flex flex-col gap-half px-base py-plusfifty",
                    "border-b border-border",
                    "text-left active:bg-secondary transition-colors",
                  )}
                >
                  <span className="text-sm font-medium text-high truncate">
                    {workspace.name}
                  </span>
                  <span className="flex items-center gap-base text-xs text-low">
                    {/* Branch */}
                    {workspace.branch && (
                      <span className="flex items-center gap-half min-w-0 shrink truncate">
                        <GitBranchIcon className="size-icon-xs shrink-0" />
                        <span className="truncate">{workspace.branch}</span>
                      </span>
                    )}

                    {/* Status indicators */}
                    <span className="flex items-center gap-half shrink-0">
                      {/* Dev server running */}
                      {workspace.hasRunningDevServer && (
                        <PlayIcon
                          className="size-icon-xs text-brand shrink-0"
                          weight="fill"
                        />
                      )}

                      {/* Failed/killed status (only when not running) */}
                      {!workspace.isRunning && isFailed && (
                        <TriangleIcon
                          className="size-icon-xs text-error shrink-0"
                          weight="fill"
                        />
                      )}

                      {/* Running dots OR hand icon for pending approval */}
                      {workspace.isRunning &&
                        (workspace.hasPendingApproval ? (
                          <HandIcon
                            className="size-icon-xs text-brand shrink-0"
                            weight="fill"
                          />
                        ) : (
                          <RunningDots />
                        ))}

                      {/* Unseen activity indicator (only when not running and not failed) */}
                      {workspace.hasUnseenActivity &&
                        !workspace.isRunning &&
                        !isFailed && (
                          <CircleIcon
                            className="size-icon-xs text-brand shrink-0"
                            weight="fill"
                          />
                        )}

                      {/* PR status icon */}
                      {workspace.prStatus === "open" && (
                        <GitPullRequestIcon
                          className="size-icon-xs text-success shrink-0"
                          weight="fill"
                        />
                      )}
                      {workspace.prStatus === "merged" && (
                        <GitPullRequestIcon
                          className="size-icon-xs text-merged shrink-0"
                          weight="fill"
                        />
                      )}

                      {/* Pin icon */}
                      {workspace.isPinned && (
                        <PushPinIcon
                          className="size-icon-xs text-brand shrink-0"
                          weight="fill"
                        />
                      )}
                    </span>

                    {/* Elapsed time */}
                    {!workspace.isRunning &&
                      workspace.latestProcessCompletedAt && (
                        <span className="shrink-0">
                          {formatRelativeElapsed(
                            workspace.latestProcessCompletedAt,
                          )}
                        </span>
                      )}

                    {/* File changes */}
                    {hasChanges && (
                      <span className="shrink-0 flex items-center gap-half">
                        <FileIcon className="size-icon-xs" weight="fill" />
                        <span>{workspace.filesChanged}</span>
                        {workspace.linesAdded !== undefined && (
                          <span className="text-success">
                            +{workspace.linesAdded}
                          </span>
                        )}
                        {workspace.linesRemoved !== undefined && (
                          <span className="text-error">
                            -{workspace.linesRemoved}
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const formatRelativeElapsed = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
};
