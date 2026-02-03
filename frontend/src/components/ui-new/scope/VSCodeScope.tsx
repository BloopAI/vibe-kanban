import { ReactNode, useState } from 'react';
import { PortalContainerContext } from '@/contexts/PortalContainerContext';
import {
  WorkspaceProvider,
  useWorkspaceContext,
} from '@/contexts/WorkspaceContext';
import { ActionsProvider } from '@/contexts/ActionsContext';
import { ExecutionProcessesProvider } from '@/contexts/ExecutionProcessesContext';
import { LogsPanelProvider } from '@/contexts/LogsPanelContext';
import NiceModal from '@ebay/nice-modal-react';
import '@/styles/new/index.css';

interface VSCodeScopeProps {
  children: ReactNode;
}

// Wrapper component to get workspaceId from context for ExecutionProcessesProvider
function ExecutionProcessesProviderWrapper({
  children,
}: {
  children: ReactNode;
}) {
  const { workspaceId, selectedSessionId } = useWorkspaceContext();
  return (
    <ExecutionProcessesProvider
      attemptId={workspaceId}
      sessionId={selectedSessionId}
    >
      {children}
    </ExecutionProcessesProvider>
  );
}

/**
 * VSCodeScope - Minimal provider stack for VS Code extension
 *
 * This is a stripped-down version of NewDesignScope that excludes:
 * - SequenceTrackerProvider (keyboard sequences)
 * - SequenceIndicator (key sequence hints)
 * - KeyboardShortcutsHandler (g>s, w>d, v>c shortcuts)
 * - useWorkspaceShortcuts hook
 *
 * This prevents keyboard shortcuts from interfering with VS Code's own shortcuts.
 */
export function VSCodeScope({ children }: VSCodeScopeProps) {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  return (
    <div ref={setContainer} className="new-design h-full">
      {container && (
        <PortalContainerContext.Provider value={container}>
          <WorkspaceProvider>
            <ExecutionProcessesProviderWrapper>
              <LogsPanelProvider>
                <ActionsProvider>
                  <NiceModal.Provider>{children}</NiceModal.Provider>
                </ActionsProvider>
              </LogsPanelProvider>
            </ExecutionProcessesProviderWrapper>
          </WorkspaceProvider>
        </PortalContainerContext.Provider>
      )}
    </div>
  );
}
