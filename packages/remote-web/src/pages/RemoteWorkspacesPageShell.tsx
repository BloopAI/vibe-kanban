import { type ReactNode } from "react";
import WorkspacesUnavailablePage from "@remote/pages/WorkspacesUnavailablePage";
import { useResolvedRelayWorkspaceHostId } from "@remote/shared/hooks/useResolvedRelayWorkspaceHostId";
import { useRelayWorkspaceHostHealth } from "@remote/shared/hooks/useRelayWorkspaceHostHealth";

interface RemoteWorkspacesPageShellProps {
  children: ReactNode;
}

export function RemoteWorkspacesPageShell({
  children,
}: RemoteWorkspacesPageShellProps) {
  const resolvedHostId = useResolvedRelayWorkspaceHostId();
  const hostHealth = useRelayWorkspaceHostHealth(resolvedHostId);

  if (!resolvedHostId) {
    return <WorkspacesUnavailablePage />;
  }

  if (hostHealth.isChecking) {
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

  if (hostHealth.isError) {
    return (
      <WorkspacesUnavailablePage
        blockedHost={{
          id: resolvedHostId,
          name: null,
          errorMessage: hostHealth.errorMessage,
        }}
      />
    );
  }

  return children;
}
