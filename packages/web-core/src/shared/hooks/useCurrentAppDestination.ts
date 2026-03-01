import { useMemo } from 'react';
import { useLocation } from '@tanstack/react-router';
import { useAppNavigation } from '@/shared/hooks/useAppNavigation';
import type { AppDestination } from '@/shared/lib/routes/appNavigation';

export function useCurrentAppDestination(): AppDestination | null {
  const appNavigation = useAppNavigation();
  const location = useLocation();

  return useMemo(
    () => appNavigation.resolveFromPath(location.pathname),
    [appNavigation, location.pathname]
  );
}
