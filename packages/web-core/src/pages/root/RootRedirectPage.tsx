import { useEffect, useState } from 'react';
import { useUserSystem } from '@/shared/hooks/useUserSystem';
import { getFirstProjectDestination } from '@/shared/lib/firstProjectDestination';
import { useOrganizationStore } from '@/shared/stores/useOrganizationStore';
import { useAppNavigation } from '@/shared/hooks/useAppNavigation';

const DEFAULT_DESTINATION = '/workspaces/create';

export function RootRedirectPage() {
  const { config, loading, loginStatus } = useUserSystem();
  const setSelectedOrgId = useOrganizationStore((s) => s.setSelectedOrgId);
  const appNavigation = useAppNavigation();
  const [destination, setDestination] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const resolveDestination = async () => {
      if (loading || !config) {
        return;
      }

      if (!config.remote_onboarding_acknowledged) {
        setDestination('/onboarding');
        return;
      }

      if (loginStatus?.status !== 'loggedin') {
        setDestination(DEFAULT_DESTINATION);
        return;
      }

      const firstProjectDestination =
        await getFirstProjectDestination(setSelectedOrgId);
      if (!cancelled) {
        const resolvedDestination =
          firstProjectDestination ?? DEFAULT_DESTINATION;
        setDestination(resolvedDestination);
      }
    };

    void resolveDestination();

    return () => {
      cancelled = true;
    };
  }, [config, loading, loginStatus?.status, setSelectedOrgId]);

  useEffect(() => {
    if (loading || !config || !destination) {
      return;
    }

    const resolvedDestination =
      appNavigation.resolveFromPath(destination) ??
      (destination === '/onboarding'
        ? appNavigation.toOnboarding()
        : appNavigation.toWorkspacesCreate());

    appNavigation.navigate(resolvedDestination, { replace: true });
  }, [appNavigation, config, destination, loading]);

  if (loading || !config || !destination) {
    return (
      <div className="h-screen bg-primary flex items-center justify-center">
        <p className="text-low">Loading...</p>
      </div>
    );
  }

  return null;
}
