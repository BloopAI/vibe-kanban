import { ReactNode, useRef } from 'react';
import { PortalContainerContext } from '@/contexts/PortalContainerContext';
import '@/styles/legacy/index.css';

interface LegacyDesignScopeProps {
  children: ReactNode;
}

export function LegacyDesignScope({ children }: LegacyDesignScopeProps) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} className="legacy-design h-full">
      <PortalContainerContext.Provider value={ref}>
        {children}
      </PortalContainerContext.Provider>
    </div>
  );
}
