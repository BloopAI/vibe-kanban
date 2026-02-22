import { createFileRoute } from '@tanstack/react-router';
import { VSCodeScope } from '@/app/providers/VSCodeScope';
import { TerminalProvider } from '@/contexts/TerminalContext';
import { VSCodeWorkspacePage } from '@/features/workspace/ui/VSCodeWorkspacePage';

function VSCodeWorkspaceRouteComponent() {
  return (
    <VSCodeScope>
      <TerminalProvider>
        <VSCodeWorkspacePage />
      </TerminalProvider>
    </VSCodeScope>
  );
}

export const Route = createFileRoute('/workspaces/$workspaceId/vscode')({
  component: VSCodeWorkspaceRouteComponent,
});
