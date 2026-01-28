import { ReactNode, useState } from 'react';
import { PortalContainerContext } from '@/contexts/PortalContainerContext';
import NiceModal from '@ebay/nice-modal-react';
import '@/styles/legacy/index.css';

interface LegacyDesignScopeProps {
  children: ReactNode;
}

export function LegacyDesignScope({ children }: LegacyDesignScopeProps) {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  return (
    <div ref={setContainer} className="legacy-design min-h-screen">
      {container && (
        <PortalContainerContext.Provider value={container}>
          <NiceModal.Provider>{children}</NiceModal.Provider>
        </PortalContainerContext.Provider>
      )}
    </div>
  );
}
