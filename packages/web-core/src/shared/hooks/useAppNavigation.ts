import { useMemo } from 'react';
import { useLocation } from '@tanstack/react-router';
import { useAppRuntime } from '@/shared/hooks/useAppRuntime';
import { createAppNavigation } from '@/shared/lib/routes/appNavigation';
import { parseAppPathname } from '@/shared/lib/routes/pathResolution';

export function useAppNavigation() {
  const runtime = useAppRuntime();
  const location = useLocation();
  const { hostId } = parseAppPathname(location.pathname);

  return useMemo(
    () => createAppNavigation({ runtime, hostId }),
    [runtime, hostId]
  );
}
