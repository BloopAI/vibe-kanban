import { createContext, useContext, RefObject } from 'react';

export const PortalContainerContext =
  createContext<RefObject<HTMLElement> | null>(null);

export function usePortalContainer() {
  const ref = useContext(PortalContainerContext);
  return ref?.current ?? undefined;
}
