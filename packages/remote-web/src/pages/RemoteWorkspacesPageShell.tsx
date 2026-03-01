import { useEffect, type ReactNode } from "react";
import { useParams } from "@tanstack/react-router";
import WorkspacesUnavailablePage from "@remote/pages/WorkspacesUnavailablePage";
import { useRelayWorkspaceHostHealth } from "@remote/shared/hooks/useRelayWorkspaceHostHealth";
import { useWorkspaceContext } from "@/shared/hooks/useWorkspaceContext";
import { useMobileWorkspaceTitle } from "@remote/shared/stores/useMobileWorkspaceTitle";

interface RemoteWorkspacesPageShellProps {
  children: ReactNode;
}

function WorkspaceTitleSync() {
  const { workspace } = useWorkspaceContext();
  const setTitle = useMobileWorkspaceTitle((s) => s.setTitle);

  useEffect(() => {
    setTitle(workspace?.name ?? workspace?.branch ?? null);
    return () => setTitle(null);
  }, [workspace?.name, workspace?.branch, setTitle]);

  return null;
}

export function RemoteWorkspacesPageShell({
  children,
}: RemoteWorkspacesPageShellProps) {
  const { hostId } = useParams({ strict: false });
  const hostHealth = useRelayWorkspaceHostHealth(hostId ?? null);

  if (!hostId) {
    return <WorkspacesUnavailablePage />;
  }

  if (hostHealth.isChecking) {
    return (
      <WorkspacesUnavailablePage
        blockedHost={{
          id: hostId,
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
          id: hostId,
          name: null,
          errorMessage: hostHealth.errorMessage,
        }}
      />
    );
  }

  return (
    <>
      <WorkspaceTitleSync />
      {children}
    </>
  );
}
