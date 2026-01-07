import { ReactNode, useRef } from 'react';
import { PortalContainerContext } from '@/contexts/PortalContainerContext';
import { WorkspaceProvider } from '@/contexts/WorkspaceContext';
import { ActionsProvider } from '@/contexts/ActionsContext';
import NiceModal from '@ebay/nice-modal-react';
import '@/styles/new/index.css';

interface NewDesignScopeProps {
  children: ReactNode;
}

export function NewDesignScope({ children }: NewDesignScopeProps) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} className="new-design h-full">
      <PortalContainerContext.Provider value={ref}>
        <WorkspaceProvider>
          <ActionsProvider>
            <NiceModal.Provider>{children}</NiceModal.Provider>
          </ActionsProvider>
        </WorkspaceProvider>
      </PortalContainerContext.Provider>
    </div>
  );
}
