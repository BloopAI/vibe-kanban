import { createContext, useContext } from 'react';

export const PortalContainerContext = createContext<HTMLElement | null>(null);

export function usePortalContainer() {
  const container = useContext(PortalContainerContext);
  return container ?? undefined;
}
