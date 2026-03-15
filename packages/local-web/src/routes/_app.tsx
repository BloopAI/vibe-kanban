import { type ReactNode } from 'react';
import { createFileRoute, useParams } from '@tanstack/react-router';
import { SequenceTrackerProvider } from '@/shared/keyboard/SequenceTracker';
import { SequenceIndicator } from '@/shared/keyboard/SequenceIndicator';
import { useWorkspaceShortcuts } from '@/shared/keyboard/useWorkspaceShortcuts';
import { useIssueShortcuts } from '@/shared/keyboard/useIssueShortcuts';
import { useKeyShowHelp, Scope } from '@/shared/keyboard';
import { KeyboardShortcutsDialog } from '@/shared/dialogs/shared/KeyboardShortcutsDialog';
import { TerminalProvider } from '@/shared/providers/TerminalProvider';
import { HostIdProvider } from '@/shared/providers/HostIdProvider';
import { WorkspaceProvider } from '@/shared/providers/WorkspaceProvider';
import { ExecutionProcessesProvider } from '@/shared/providers/ExecutionProcessesProvider';
import { LogsPanelProvider } from '@/shared/providers/LogsPanelProvider';
import { ActionsProvider } from '@/shared/providers/ActionsProvider';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';
import { SharedAppLayout } from '@/shared/components/ui-new/containers/SharedAppLayout';

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

function AppRouteProviders({ children }: { children: ReactNode }) {
  return (
    <HostIdProvider>
      <WorkspaceProvider>
        <ExecutionProcessesProviderWrapper>
          <LogsPanelProvider>
            <ActionsProvider>{children}</ActionsProvider>
          </LogsPanelProvider>
        </ExecutionProcessesProviderWrapper>
      </WorkspaceProvider>
    </HostIdProvider>
  );
}

function AppLayoutRouteComponent() {
  const { hostId } = useParams({ strict: false });

  return (
    <AppRouteProviders key={hostId ?? 'local'}>
      <SequenceTrackerProvider>
        <SequenceIndicator />
        <KeyboardShortcutsHandler />
        <TerminalProvider>
          <SharedAppLayout />
        </TerminalProvider>
      </SequenceTrackerProvider>
    </AppRouteProviders>
  );
}

export const Route = createFileRoute('/_app')({
  component: AppLayoutRouteComponent,
});
