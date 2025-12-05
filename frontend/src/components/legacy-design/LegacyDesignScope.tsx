import { ReactNode, useRef } from 'react';
import { PortalContainerContext } from '@/contexts/PortalContainerContext';
import NiceModal from '@ebay/nice-modal-react';
import '@/styles/legacy/index.css';

interface LegacyDesignScopeProps {
  children: ReactNode;
}

export function LegacyDesignScope({ children }: LegacyDesignScopeProps) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} className="legacy-design min-h-screen">
      <NiceModal.Provider>
        <PortalContainerContext.Provider value={ref}>
          {children}
        </PortalContainerContext.Provider>
      </NiceModal.Provider>
    </div>
  );
}
