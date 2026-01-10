import { ReactNode, useRef, useEffect } from 'react';
import { usePostHog } from 'posthog-js/react';
import { PortalContainerContext } from '@/contexts/PortalContainerContext';
import { WorkspaceProvider } from '@/contexts/WorkspaceContext';
import { ActionsProvider } from '@/contexts/ActionsContext';
import NiceModal from '@ebay/nice-modal-react';
import '@/styles/new/index.css';

const UI_NEW_ACCESSED_KEY = 'ui_new_accessed';

interface NewDesignScopeProps {
  children: ReactNode;
}

export function NewDesignScope({ children }: NewDesignScopeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const posthog = usePostHog();

  useEffect(() => {
    if (!sessionStorage.getItem(UI_NEW_ACCESSED_KEY)) {
      posthog?.capture('ui_new_accessed');
      sessionStorage.setItem(UI_NEW_ACCESSED_KEY, 'true');
    }
  }, [posthog]);

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
