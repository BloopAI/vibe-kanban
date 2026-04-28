import { useEffect, useRef } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useUserSystem } from '@/shared/hooks/useUserSystem';
import { useAppNavigation } from '@/shared/hooks/useAppNavigation';

// Local-only deployment: there is no external sign-in step. As soon as the
// user lands here we acknowledge onboarding and bounce to the root route,
// which then routes them to their first project (or workspace creation).
function OnboardingSignInRouteComponent() {
  const { config, loading, updateAndSaveConfig } = useUserSystem();
  const appNavigation = useAppNavigation();
  const ranRef = useRef(false);

  useEffect(() => {
    if (loading || !config || ranRef.current) return;
    ranRef.current = true;

    void (async () => {
      if (!config.remote_onboarding_acknowledged) {
        await updateAndSaveConfig({
          remote_onboarding_acknowledged: true,
          onboarding_acknowledged: true,
          disclaimer_acknowledged: true,
        });
      }
      appNavigation.goToRoot({ replace: true });
    })();
  }, [appNavigation, config, loading, updateAndSaveConfig]);

  return (
    <div className="h-screen bg-primary flex items-center justify-center">
      <p className="text-low">Loading...</p>
    </div>
  );
}

export const Route = createFileRoute('/onboarding_/sign-in')({
  component: OnboardingSignInRouteComponent,
});
