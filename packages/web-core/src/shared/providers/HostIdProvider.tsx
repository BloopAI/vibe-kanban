import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { useCurrentAppDestination } from '@/shared/hooks/useCurrentAppDestination';
import { getDestinationHostId } from '@/shared/lib/routes/appNavigation';

// Module-level getter so the API transport can read the hostId outside React
let _hostId: string | null = null;
export function getCurrentHostId(): string | null {
  return _hostId;
}

const HostIdContext = createContext<string | null>(null);

export function useHostId(): string | null {
  return useContext(HostIdContext);
}

export function HostIdProvider({ children }: { children: ReactNode }) {
  const destination = useCurrentAppDestination();
  const hostId = useMemo(
    () => getDestinationHostId(destination),
    [destination]
  );

  useLayoutEffect(() => {
    _hostId = hostId;
    return () => {
      _hostId = null;
    };
  }, [hostId]);

  return (
    <HostIdContext.Provider value={hostId}>{children}</HostIdContext.Provider>
  );
}
