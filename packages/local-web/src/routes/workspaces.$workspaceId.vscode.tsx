import { createFileRoute } from '@tanstack/react-router';
import { Provider as NiceModalProvider } from '@ebay/nice-modal-react';
import { HostIdProvider } from '@/shared/providers/HostIdProvider';
import { WorkspaceProvider } from '@/shared/providers/WorkspaceProvider';
import { ActionsProvider } from '@/shared/providers/ActionsProvider';
import { TerminalProvider } from '@/shared/providers/TerminalProvider';
import { VSCodeWorkspacePage } from '@/pages/workspaces/VSCodeWorkspacePage';

function VSCodeWorkspaceRouteComponent() {
  return (
    <HostIdProvider>
      <WorkspaceProvider>
        <ActionsProvider>
          <NiceModalProvider>
            <TerminalProvider>
              <VSCodeWorkspacePage />
            </TerminalProvider>
          </NiceModalProvider>
        </ActionsProvider>
      </WorkspaceProvider>
    </HostIdProvider>
  );
}

export const Route = createFileRoute('/workspaces/$workspaceId/vscode')({
  component: VSCodeWorkspaceRouteComponent,
});
