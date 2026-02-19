import { createFileRoute } from '@tanstack/react-router';
import { VSCodeScope } from '@/components/ui-new/scope/VSCodeScope';
import { TerminalProvider } from '@/contexts/TerminalContext';
import { VSCodeWorkspacePage } from '@/pages/ui-new/VSCodeWorkspacePage';

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
