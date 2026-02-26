import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import type { Workspace, WorkspaceSummary } from "shared/types";
import { listRelayHosts } from "@/shared/lib/remoteApi";
import { loadRelayHostWorkspaces } from "@remote/shared/lib/relayHostApi";

interface WorkspaceRowData {
  workspace: Workspace;
  summary?: WorkspaceSummary;
}

export default function WorkspacesUnavailablePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const selectedHostId = useMemo(() => {
    const searchParams = new URLSearchParams(location.searchStr);
    return searchParams.get("hostId");
  }, [location.searchStr]);

  const hostsQuery = useQuery({
    queryKey: ["remote-workspaces", "hosts"],
    queryFn: listRelayHosts,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const hosts = hostsQuery.data ?? [];
  const selectedHost = useMemo(
    () => hosts.find((host) => host.id === selectedHostId) ?? null,
    [hosts, selectedHostId],
  );
  const onlineHosts = useMemo(
    () => hosts.filter((host) => host.status === "online"),
    [hosts],
  );

  const workspacesQuery = useQuery({
    queryKey: ["remote-workspaces", "host", selectedHostId],
    queryFn: () => loadRelayHostWorkspaces(selectedHostId!),
    enabled: !!selectedHostId && selectedHost?.status === "online",
    retry: false,
  });

  const activeRows = useMemo(
    () =>
      buildWorkspaceRows(
        workspacesQuery.data?.workspaces ?? [],
        workspacesQuery.data?.summariesByWorkspaceId ?? new Map(),
        false,
      ),
    [workspacesQuery.data],
  );

  const archivedRows = useMemo(
    () =>
      buildWorkspaceRows(
        workspacesQuery.data?.workspaces ?? [],
        workspacesQuery.data?.summariesByWorkspaceId ?? new Map(),
        true,
      ),
    [workspacesQuery.data],
  );

  return (
    <div className="mx-auto h-full w-full max-w-6xl overflow-auto px-double py-double">
      <div className="flex items-center justify-between gap-base">
        <h1 className="text-2xl font-semibold text-high">Workspaces</h1>
        {selectedHost && (
          <span className="rounded-sm border border-border bg-secondary px-base py-half text-xs text-low">
            Host: {selectedHost.name}
          </span>
        )}
      </div>

      <p className="mt-half text-sm text-low">
        Workspace data is loaded from the selected host through relay tunnel
        endpoints.
      </p>

      <div className="mt-base flex flex-wrap gap-half">
        {hosts.map((host) => {
          const isSelected = host.id === selectedHostId;
          const isOnline = host.status === "online";
          return (
            <button
              key={host.id}
              type="button"
              disabled={!isOnline}
              onClick={() =>
                navigate({
                  to: "/workspaces",
                  search: { hostId: host.id },
                })
              }
              className={`rounded-sm border px-base py-half text-xs transition-colors ${
                isSelected
                  ? "border-brand bg-brand/10 text-high"
                  : "border-border bg-secondary text-low"
              } ${
                isOnline
                  ? "cursor-pointer hover:border-brand/60 hover:text-normal"
                  : "cursor-not-allowed opacity-50"
              }`}
            >
              {host.name}
            </button>
          );
        })}
      </div>

      {hostsQuery.isLoading && (
        <LoadingState message="Loading hosts..." className="mt-double" />
      )}

      {hostsQuery.error instanceof Error && (
        <ErrorState
          message={hostsQuery.error.message}
          className="mt-double"
          onRetry={() => {
            void hostsQuery.refetch();
          }}
        />
      )}

      {!hostsQuery.isLoading && hosts.length === 0 && (
        <InfoState className="mt-double" message="No hosts found." />
      )}

      {!hostsQuery.isLoading && !selectedHostId && onlineHosts.length > 0 && (
        <InfoState
          className="mt-double"
          message="Select an online host to view workspaces."
        />
      )}

      {!hostsQuery.isLoading && selectedHostId && !selectedHost && (
        <InfoState
          className="mt-double"
          message="The selected host is no longer available."
        />
      )}

      {!hostsQuery.isLoading &&
        selectedHost &&
        selectedHost.status !== "online" && (
          <InfoState
            className="mt-double"
            message="The selected host is offline. Connect it, then try again."
          />
        )}

      {workspacesQuery.isLoading && (
        <LoadingState
          message="Loading workspaces from host..."
          className="mt-double"
        />
      )}

      {workspacesQuery.error instanceof Error && (
        <ErrorState
          message={workspacesQuery.error.message}
          className="mt-double"
          onRetry={() => {
            void workspacesQuery.refetch();
          }}
        />
      )}

      {!workspacesQuery.isLoading &&
        !workspacesQuery.error &&
        selectedHost?.status === "online" && (
          <div className="mt-double space-y-double">
            <WorkspaceSection title="Active" rows={activeRows} />
            <WorkspaceSection title="Archived" rows={archivedRows} />
          </div>
        )}
    </div>
  );
}

function WorkspaceSection({
  title,
  rows,
}: {
  title: string;
  rows: WorkspaceRowData[];
}) {
  return (
    <section>
      <div className="mb-base flex items-center justify-between">
        <h2 className="text-base font-semibold text-high">{title}</h2>
        <span className="text-xs text-low">{rows.length}</span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-sm border border-border bg-secondary px-base py-base text-sm text-low">
          No workspaces
        </div>
      ) : (
        <div className="grid gap-base md:grid-cols-2">
          {rows.map(({ workspace, summary }) => (
            <article
              key={workspace.id}
              className="rounded-sm border border-border bg-secondary px-base py-base"
            >
              <div className="flex items-center justify-between gap-base">
                <h3 className="truncate text-sm font-medium text-high">
                  {workspace.name ?? workspace.branch}
                </h3>
                {workspace.pinned && (
                  <span className="rounded-sm bg-brand/15 px-1.5 py-0.5 text-[10px] font-medium text-brand">
                    Pinned
                  </span>
                )}
              </div>

              <p className="mt-half truncate font-mono text-xs text-low">
                {workspace.branch}
              </p>

              <p className="mt-half text-xs text-low">
                Updated {formatDate(workspace.updated_at)}
              </p>

              <p className="mt-half text-xs text-low">
                {formatSummary(summary)}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function LoadingState({
  message,
  className,
}: {
  message: string;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-half rounded-sm border border-border bg-secondary px-base py-base text-sm text-normal ${className ?? ""}`}
    >
      <span className="size-icon-sm rounded-full border-2 border-brand/30 border-t-brand animate-spin" />
      <span>{message}</span>
    </div>
  );
}

function InfoState({
  message,
  className,
}: {
  message: string;
  className?: string;
}) {
  return (
    <div
      className={`rounded-sm border border-border bg-secondary px-base py-base text-sm text-low ${className ?? ""}`}
    >
      {message}
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div
      className={`rounded-sm border border-error/50 bg-error/10 px-base py-base text-sm text-error ${className ?? ""}`}
    >
      <p>{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-base rounded-sm border border-error/40 px-base py-half text-xs hover:bg-error/10"
      >
        Retry
      </button>
    </div>
  );
}

function buildWorkspaceRows(
  workspaces: Workspace[],
  summariesByWorkspaceId: Map<string, WorkspaceSummary>,
  archived: boolean,
): WorkspaceRowData[] {
  return [...workspaces]
    .filter((workspace) => workspace.archived === archived)
    .sort((a, b) => compareWorkspaces(a, b))
    .map((workspace) => ({
      workspace,
      summary: summariesByWorkspaceId.get(workspace.id),
    }));
}

function compareWorkspaces(a: Workspace, b: Workspace): number {
  if (a.pinned !== b.pinned) {
    return a.pinned ? -1 : 1;
  }

  const updatedA = Date.parse(a.updated_at);
  const updatedB = Date.parse(b.updated_at);
  return updatedB - updatedA;
}

function formatDate(rawDate: string): string {
  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) {
    return rawDate;
  }
  return date.toLocaleString();
}

function formatSummary(summary: WorkspaceSummary | undefined): string {
  if (!summary) {
    return "No summary available yet.";
  }

  const filesChanged = summary.files_changed ?? 0;
  const linesAdded = summary.lines_added ?? 0;
  const linesRemoved = summary.lines_removed ?? 0;
  const status = summary.latest_process_status ?? "unknown";

  return `${filesChanged} files · +${linesAdded} -${linesRemoved} · ${status}`;
}
