import { type ReactNode, useContext, useMemo, useState } from 'react';
import { createHmrContext } from '@/shared/lib/hmrContext';

interface WorkspaceSidebarHoverContextValue {
  isAppBarHovered: boolean;
  setAppBarHovered: (value: boolean) => void;
}

const WorkspaceSidebarHoverContext =
  createHmrContext<WorkspaceSidebarHoverContextValue | null>(
    'WorkspaceSidebarHoverContext',
    null
  );

export function WorkspaceSidebarHoverProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [isAppBarHovered, setAppBarHovered] = useState(false);

  const value = useMemo(
    () => ({
      isAppBarHovered,
      setAppBarHovered,
    }),
    [isAppBarHovered]
  );

  return (
    <WorkspaceSidebarHoverContext.Provider value={value}>
      {children}
    </WorkspaceSidebarHoverContext.Provider>
  );
}

export function useWorkspaceSidebarHover() {
  const context = useContext(WorkspaceSidebarHoverContext);
  if (!context) {
    throw new Error(
      'useWorkspaceSidebarHover must be used within WorkspaceSidebarHoverProvider'
    );
  }

  return context;
}
