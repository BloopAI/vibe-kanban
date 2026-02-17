import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useUserSystem } from '@/components/ConfigProvider';
import { getFirstProjectDestination } from '@/lib/firstProjectDestination';
import { useOrganizationStore } from '@/stores/useOrganizationStore';

const DEFAULT_DESTINATION = '/workspaces/create';
const NAV_DEBUG_PREFIX = '[NAV_DEBUG]';

export function RootRedirectPage() {
  const { config, loading, loginStatus } = useUserSystem();
  const setSelectedOrgId = useOrganizationStore((s) => s.setSelectedOrgId);
  const [destination, setDestination] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const resolveDestination = async () => {
      console.log(`${NAV_DEBUG_PREFIX} root redirect evaluating`, {
        loading,
        hasConfig: Boolean(config),
        remoteOnboardingAcknowledged: config?.remote_onboarding_acknowledged,
        loginStatus: loginStatus?.status ?? null,
      });

      if (loading || !config) {
        console.log(
          `${NAV_DEBUG_PREFIX} root redirect waiting for config/user-system`
        );
        return;
      }

      if (!config.remote_onboarding_acknowledged) {
        console.log(
          `${NAV_DEBUG_PREFIX} redirecting to onboarding because remote onboarding is not acknowledged`
        );
        setDestination('/onboarding');
        return;
      }

      if (loginStatus?.status !== 'loggedin') {
        console.log(
          `${NAV_DEBUG_PREFIX} redirecting to workspaces because user is not logged in`,
          {
            loginStatus: loginStatus?.status ?? null,
          }
        );
        setDestination(DEFAULT_DESTINATION);
        return;
      }

      const firstProjectDestination =
        await getFirstProjectDestination(setSelectedOrgId);
      if (!cancelled) {
        const resolvedDestination =
          firstProjectDestination ?? DEFAULT_DESTINATION;
        console.log(`${NAV_DEBUG_PREFIX} final root destination`, {
          firstProjectDestination,
          fallbackDestination: DEFAULT_DESTINATION,
          resolvedDestination,
        });
        setDestination(resolvedDestination);
      }
    };

    void resolveDestination();

    return () => {
      cancelled = true;
    };
  }, [config, loading, loginStatus?.status, setSelectedOrgId]);

  if (loading || !config || !destination) {
    return (
      <div className="h-screen bg-primary flex items-center justify-center">
        <p className="text-low">Loading...</p>
      </div>
    );
  }

  return <Navigate to={destination} replace />;
}
