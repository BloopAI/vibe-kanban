import { createFileRoute } from '@tanstack/react-router';
import { UserProvider } from '@/integrations/remote/UserProvider';
import { SequenceTrackerProvider } from '@/keyboard/SequenceTracker';
import { SequenceIndicator } from '@/keyboard/SequenceIndicator';
import { useWorkspaceShortcuts } from '@/keyboard/useWorkspaceShortcuts';
import { useIssueShortcuts } from '@/keyboard/useIssueShortcuts';
import { useKeyShowHelp, Scope } from '@/keyboard';
import { KeyboardShortcutsDialog } from '@/shared/dialogs/shared/KeyboardShortcutsDialog';
import { TerminalProvider } from '@/app/providers/TerminalProvider';
import { SharedAppLayout } from '@/components/ui-new/containers/SharedAppLayout';

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
