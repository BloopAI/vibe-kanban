import { createFileRoute } from '@tanstack/react-router';
import { Provider as NiceModalProvider } from '@ebay/nice-modal-react';
import { TerminalProvider } from '@/shared/providers/TerminalProvider';
import { VSCodeWorkspacePage } from '@/pages/workspaces/VSCodeWorkspacePage';

function VSCodeWorkspaceRouteComponent() {
  return (
    <NiceModalProvider>
      <TerminalProvider>
        <VSCodeWorkspacePage />
      </TerminalProvider>
    </NiceModalProvider>
  );
}

export const Route = createFileRoute('/workspaces/$workspaceId/vscode')({
  component: VSCodeWorkspaceRouteComponent,
});
