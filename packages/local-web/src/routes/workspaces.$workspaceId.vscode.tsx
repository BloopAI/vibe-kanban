import { type ReactNode } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Provider as NiceModalProvider } from '@ebay/nice-modal-react';
import { HostIdProvider } from '@/shared/providers/HostIdProvider';
import { WorkspaceProvider } from '@/shared/providers/WorkspaceProvider';
import { ExecutionProcessesProvider } from '@/shared/providers/ExecutionProcessesProvider';
import { ActionsProvider } from '@/shared/providers/ActionsProvider';
import { TerminalProvider } from '@/shared/providers/TerminalProvider';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';
import { VSCodeWorkspacePage } from '@/pages/workspaces/VSCodeWorkspacePage';

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

function VSCodeWorkspaceRouteComponent() {
  return (
    <HostIdProvider>
      <WorkspaceProvider>
        <ExecutionProcessesProviderWrapper>
          <ActionsProvider>
            <NiceModalProvider>
              <TerminalProvider>
                <VSCodeWorkspacePage />
              </TerminalProvider>
            </NiceModalProvider>
          </ActionsProvider>
        </ExecutionProcessesProviderWrapper>
      </WorkspaceProvider>
    </HostIdProvider>
  );
}

export const Route = createFileRoute('/workspaces/$workspaceId/vscode')({
  component: VSCodeWorkspaceRouteComponent,
});
