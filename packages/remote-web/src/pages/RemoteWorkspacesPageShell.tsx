import { type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import WorkspacesUnavailablePage from "@remote/pages/WorkspacesUnavailablePage";
import { useResolvedRelayWorkspaceHostId } from "@remote/shared/hooks/useResolvedRelayWorkspaceHostId";
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
export function RemoteWorkspacesPageShell({
  children,
}: RemoteWorkspacesPageShellProps) {
  const resolvedHostId = useResolvedRelayWorkspaceHostId();

  const hostHealthQuery = useQuery({
    queryKey: ["remote-workspaces-host-health", resolvedHostId],
    enabled: !!resolvedHostId,
    retry: false,
    staleTime: 5_000,
    refetchInterval: 15_000,
    queryFn: async (): Promise<true> => {
      const response = await makeLocalApiRequest("/api/info", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Host returned HTTP ${response.status}`);
      }

      return true;
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
          name: null,
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
          name: null,
          errorMessage: getErrorMessage(hostHealthQuery.error),
        }}
      />
    );
  }

  return children;
}
