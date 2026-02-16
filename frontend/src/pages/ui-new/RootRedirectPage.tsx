import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useUserSystem } from '@/components/ConfigProvider';
import { getFirstProjectDestination } from '@/lib/firstProjectDestination';
import { useOrganizationStore } from '@/stores/useOrganizationStore';

const DEFAULT_DESTINATION = '/workspaces/create';

export function RootRedirectPage() {
  const { config, loading, loginStatus } = useUserSystem();
  const setSelectedOrgId = useOrganizationStore((s) => s.setSelectedOrgId);
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
        setDestination(firstProjectDestination ?? DEFAULT_DESTINATION);
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
