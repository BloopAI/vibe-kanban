import { createFileRoute } from '@tanstack/react-router';
import { TerminalProvider } from '@/app/providers/TerminalProvider';
import { VSCodeWorkspacePage } from '@/pages/workspaces/VSCodeWorkspacePage';

function VSCodeWorkspaceRouteComponent() {
  return (
    <TerminalProvider>
      <VSCodeWorkspacePage />
    </TerminalProvider>
  );
}

export const Route = createFileRoute('/workspaces/$workspaceId/vscode')({
  component: VSCodeWorkspaceRouteComponent,
});
