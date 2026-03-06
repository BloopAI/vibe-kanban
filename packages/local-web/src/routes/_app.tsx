import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { UserProvider } from '@/shared/providers/remote/UserProvider';
import { SequenceTrackerProvider } from '@/shared/keyboard/SequenceTracker';
import { SequenceIndicator } from '@/shared/keyboard/SequenceIndicator';
import { useWorkspaceShortcuts } from '@/shared/keyboard/useWorkspaceShortcuts';
import { useIssueShortcuts } from '@/shared/keyboard/useIssueShortcuts';
import { useKeyShowHelp, Scope } from '@/shared/keyboard';
import { KeyboardShortcutsDialog } from '@/shared/dialogs/shared/KeyboardShortcutsDialog';
import { TerminalProvider } from '@/shared/providers/TerminalProvider';
import { SharedAppLayout } from '@/shared/components/ui-new/containers/SharedAppLayout';
import { useCurrentAppDestination } from '@/shared/hooks/useCurrentAppDestination';
import { Workspaces } from '@/pages/workspaces/Workspaces';
import { WorkspacesLanding } from '@/pages/workspaces/WorkspacesLanding';

function KeyboardShortcutsHandler() {
  useKeyShowHelp(
    () => {
      KeyboardShortcutsDialog.show();
    },
    { scope: Scope.GLOBAL }
  );
  useWorkspaceShortcuts();
  useIssueShortcuts();
  return null;
}

function AppLayoutRouteComponent() {
  const currentDestination = useCurrentAppDestination();
  const [isAppBarHovered, setIsAppBarHovered] = useState(false);
  const workspacesContent = useMemo(() => {
    switch (currentDestination?.kind) {
      case 'workspaces':
        return <WorkspacesLanding />;
      case 'workspaces-create':
      case 'workspace':
        return <Workspaces isAppBarHovered={isAppBarHovered} />;
      default:
        return null;
    }
  }, [currentDestination?.kind, isAppBarHovered]);
  const showWorkspacesShell = workspacesContent !== null;

  useEffect(() => {
    if (!showWorkspacesShell) {
      setIsAppBarHovered(false);
    }
  }, [showWorkspacesShell]);

  return (
    <UserProvider>
      <SequenceTrackerProvider>
        <SequenceIndicator />
        <KeyboardShortcutsHandler />
        <TerminalProvider>
          <SharedAppLayout
            {...(showWorkspacesShell
              ? {
                  appBarHoverHandlers: {
                    onHoverStart: () => setIsAppBarHovered(true),
                    onHoverEnd: () => setIsAppBarHovered(false),
                  },
                  children: workspacesContent,
                }
              : {})}
          />
        </TerminalProvider>
      </SequenceTrackerProvider>
    </UserProvider>
  );
}

export const Route = createFileRoute('/_app')({
  component: AppLayoutRouteComponent,
});
