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
      <PortalContainerContext.Provider value={ref}>
        <NiceModal.Provider>{children}</NiceModal.Provider>
      </PortalContainerContext.Provider>
    </div>
  );
}
