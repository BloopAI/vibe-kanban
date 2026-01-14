import { ReactNode, useRef, useEffect } from 'react';
import { usePostHog } from 'posthog-js/react';
import { Toaster } from 'sonner';
import { PortalContainerContext } from '@/contexts/PortalContainerContext';
import {
  WorkspaceProvider,
  useWorkspaceContext,
} from '@/contexts/WorkspaceContext';
import { ActionsProvider } from '@/contexts/ActionsContext';
import { ExecutionProcessesProvider } from '@/contexts/ExecutionProcessesContext';
import { usePrMergeNotifications } from '@/hooks/usePrMergeNotifications';
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

// Component that monitors workspaces for PR merge events and shows toast notifications
function PrMergeNotificationWatcher() {
  const { activeWorkspaces, archivedWorkspaces } = useWorkspaceContext();
  // Monitor both active and archived workspaces for PR merges
  const allWorkspaces = [...activeWorkspaces, ...archivedWorkspaces];
  usePrMergeNotifications(allWorkspaces);
  return null;
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
            <ActionsProvider>
              <NiceModal.Provider>
                <PrMergeNotificationWatcher />
                <Toaster
                  position="top-right"
                  toastOptions={{
                    className: 'bg-background text-foreground border-border',
                  }}
                  richColors
                />
                {children}
              </NiceModal.Provider>
            </ActionsProvider>
          </ExecutionProcessesProviderWrapper>
        </WorkspaceProvider>
      </PortalContainerContext.Provider>
    </div>
  );
}
