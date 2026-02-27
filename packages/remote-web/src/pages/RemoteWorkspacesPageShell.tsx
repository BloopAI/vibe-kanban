import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import WorkspacesUnavailablePage from "@remote/pages/WorkspacesUnavailablePage";
import { useResolvedRelayWorkspaceHostId } from "@remote/shared/hooks/useResolvedRelayWorkspaceHostId";
import { useRelayAppBarHosts } from "@remote/shared/hooks/useRelayAppBarHosts";
import { RemoteUserSystemProvider } from "@remote/app/providers/RemoteUserSystemProvider";
import { WorkspaceProvider } from "@/shared/providers/WorkspaceProvider";
import { ExecutionProcessesProvider } from "@/shared/providers/ExecutionProcessesProvider";
import { LogsPanelProvider } from "@/shared/providers/LogsPanelProvider";
import { ActionsProvider } from "@/shared/providers/ActionsProvider";
import { TerminalProvider } from "@/shared/providers/TerminalProvider";
import { useWorkspaceContext } from "@/shared/hooks/useWorkspaceContext";
import { makeLocalApiRequest } from "@/shared/lib/localApiTransport";

interface RemoteWorkspacesPageShellProps {
  children: ReactNode;
}

function getErrorMessage(error: unknown): string | null {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return null;
}

function ExecutionProcessesProviderWrapper({
  children,
}: {
  children: ReactNode;
}) {
  const { selectedSessionId } = useWorkspaceContext();

  return (
    <ExecutionProcessesProvider sessionId={selectedSessionId}>
      {children}
    </ExecutionProcessesProvider>
  );
}

export function RemoteWorkspacesPageShell({
  children,
}: RemoteWorkspacesPageShellProps) {
  const resolvedHostId = useResolvedRelayWorkspaceHostId();
  const { hosts } = useRelayAppBarHosts(Boolean(resolvedHostId));

  const selectedHostName = useMemo(() => {
    if (!resolvedHostId) {
      return null;
    }

    return hosts.find((host) => host.id === resolvedHostId)?.name ?? null;
  }, [hosts, resolvedHostId]);

  const hostHealthQuery = useQuery({
    queryKey: ["remote-workspaces-host-health", resolvedHostId],
    enabled: !!resolvedHostId,
    retry: false,
    staleTime: 5_000,
    refetchInterval: 15_000,
    queryFn: async () => {
      const response = await makeLocalApiRequest("/api/info", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Host returned HTTP ${response.status}`);
      }
    },
  });

  if (!resolvedHostId) {
    return <WorkspacesUnavailablePage />;
  }

  if (hostHealthQuery.isPending) {
    return (
      <WorkspacesUnavailablePage
        blockedHost={{
          id: resolvedHostId,
          name: selectedHostName,
        }}
        isCheckingBlockedHost
      />
    );
  }

  if (hostHealthQuery.isError) {
    return (
      <WorkspacesUnavailablePage
        blockedHost={{
          id: resolvedHostId,
          name: selectedHostName,
          errorMessage: getErrorMessage(hostHealthQuery.error),
        }}
      />
    );
  }

  return (
    <RemoteUserSystemProvider>
      <WorkspaceProvider>
        <ExecutionProcessesProviderWrapper>
          <TerminalProvider>
            <LogsPanelProvider>
              <ActionsProvider>{children}</ActionsProvider>
            </LogsPanelProvider>
          </TerminalProvider>
        </ExecutionProcessesProviderWrapper>
      </WorkspaceProvider>
    </RemoteUserSystemProvider>
  );
}
