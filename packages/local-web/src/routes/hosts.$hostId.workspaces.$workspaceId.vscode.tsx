import { createFileRoute } from '@tanstack/react-router';
import { TerminalProvider } from '@/shared/providers/TerminalProvider';
import { VSCodeWorkspacePage } from '@/pages/workspaces/VSCodeWorkspacePage';

function HostVSCodeWorkspaceRouteComponent() {
  return (
    <TerminalProvider>
      <VSCodeWorkspacePage />
    </TerminalProvider>
  );
}

export const Route = createFileRoute(
  '/hosts/$hostId/workspaces/$workspaceId/vscode'
)({
  component: HostVSCodeWorkspaceRouteComponent,
});
