import { type ReactNode } from "react";
import WorkspacesUnavailablePage from "@remote/pages/WorkspacesUnavailablePage";
import { useResolvedRelayWorkspaceHostId } from "@remote/shared/hooks/useResolvedRelayWorkspaceHostId";
import { RemoteUserSystemProvider } from "@remote/app/providers/RemoteUserSystemProvider";
import { WorkspaceProvider } from "@/shared/providers/WorkspaceProvider";
import { ExecutionProcessesProvider } from "@/shared/providers/ExecutionProcessesProvider";
import { LogsPanelProvider } from "@/shared/providers/LogsPanelProvider";
import { ActionsProvider } from "@/shared/providers/ActionsProvider";
import { TerminalProvider } from "@/shared/providers/TerminalProvider";
import { useWorkspaceContext } from "@/shared/hooks/useWorkspaceContext";

interface RemoteWorkspacesPageShellProps {
  children: ReactNode;
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

  if (!resolvedHostId) {
    return <WorkspacesUnavailablePage />;
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
