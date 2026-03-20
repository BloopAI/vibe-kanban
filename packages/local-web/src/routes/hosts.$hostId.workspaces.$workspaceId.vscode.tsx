import { createFileRoute } from '@tanstack/react-router';
import { Provider as NiceModalProvider } from '@ebay/nice-modal-react';
import { TerminalProvider } from '@/shared/providers/TerminalProvider';
import { VSCodeWorkspacePage } from '@/pages/workspaces/VSCodeWorkspacePage';

function HostVSCodeWorkspaceRouteComponent() {
  return (
    <NiceModalProvider>
      <TerminalProvider>
        <VSCodeWorkspacePage />
      </TerminalProvider>
    </NiceModalProvider>
  );
}

export const Route = createFileRoute(
  '/hosts/$hostId/workspaces/$workspaceId/vscode'
)({
  component: HostVSCodeWorkspaceRouteComponent,
});
