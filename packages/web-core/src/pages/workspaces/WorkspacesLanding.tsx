import { useEffect } from 'react';
import { useAppNavigation } from '@/shared/hooks/useAppNavigation';

export function WorkspacesLanding() {
  const appNavigation = useAppNavigation();

  useEffect(() => {
    appNavigation.goToWorkspacesCreate({
      replace: true,
    });
  }, [appNavigation]);

  return null;
}
