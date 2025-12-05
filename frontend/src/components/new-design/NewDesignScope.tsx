import { ReactNode, useRef } from 'react';
import { PortalContainerContext } from '@/contexts/PortalContainerContext';
import '@/styles/new/index.css';

interface NewDesignScopeProps {
  children: ReactNode;
}

export function NewDesignScope({ children }: NewDesignScopeProps) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} className="new-design h-full">
      <PortalContainerContext.Provider value={ref}>
        {children}
      </PortalContainerContext.Provider>
    </div>
  );
}
