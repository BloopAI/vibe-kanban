import { ReactNode, useRef, useEffect } from 'react';
import { usePostHog } from 'posthog-js/react';
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

interface NewDesignScopeProps {
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

export function NewDesignScope({ children }: NewDesignScopeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const posthog = usePostHog();
  const hasTracked = useRef(false);

  useEffect(() => {
    if (!hasTracked.current) {
      posthog?.capture('ui_new_accessed');
      hasTracked.current = true;
    }
  }, [posthog]);

  return (
    <div ref={ref} className="new-design h-full">
      <PortalContainerContext.Provider value={ref}>
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
    </div>
  );
}
