import { createFileRoute } from '@tanstack/react-router';
import { UserProvider } from '@/shared/providers/remote/UserProvider';
import { SequenceTrackerProvider } from '@/shared/keyboard/SequenceTracker';
import { SequenceIndicator } from '@/shared/keyboard/SequenceIndicator';
import { useWorkspaceShortcuts } from '@/shared/keyboard/useWorkspaceShortcuts';
import { useIssueShortcuts } from '@/shared/keyboard/useIssueShortcuts';
import { useKeyShowHelp, Scope } from '@/shared/keyboard';
import { KeyboardShortcutsDialog } from '@/shared/dialogs/shared/KeyboardShortcutsDialog';
import { TerminalProvider } from '@/shared/providers/TerminalProvider';
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

function AppLayoutRouteComponent() {
  return (
    <UserProvider>
      <SequenceTrackerProvider>
        <SequenceIndicator />
        <KeyboardShortcutsHandler />
        <TerminalProvider>
          <SharedAppLayout />
        </TerminalProvider>
      </SequenceTrackerProvider>
    </UserProvider>
  );
}

export const Route = createFileRoute('/_app')({
  component: AppLayoutRouteComponent,
});
