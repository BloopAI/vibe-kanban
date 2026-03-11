import { useEffect } from 'react';
import { SpinnerIcon } from '@phosphor-icons/react';
import { useAppNavigation } from '@/shared/hooks/useAppNavigation';

export function WorkspacesLanding() {
  const appNavigation = useAppNavigation();

  useEffect(() => {
    appNavigation.goToWorkspacesCreate({
      replace: true,
    });
  }, [appNavigation]);

  return (
    <div className="flex h-full flex-1 items-center justify-center bg-primary">
      <SpinnerIcon className="size-6 animate-spin text-low" />
    </div>
  );
}
