import { useEffect, useState } from 'react';
import { useUserSystem } from '@/shared/hooks/useUserSystem';
import { getFirstProjectDestination } from '@/shared/lib/firstProjectDestination';
import { useOrganizationStore } from '@/shared/stores/useOrganizationStore';
import { useAppNavigation } from '@/shared/hooks/useAppNavigation';

type RootRedirectDestination =
  | { kind: 'onboarding' }
  | { kind: 'workspaces-create' }
  | { kind: 'project'; projectId: string };

const DEFAULT_DESTINATION: RootRedirectDestination = {
  kind: 'workspaces-create',
};

export function RootRedirectPage() {
  const { config, loading, loginStatus } = useUserSystem();
  const setSelectedOrgId = useOrganizationStore((s) => s.setSelectedOrgId);
  const appNavigation = useAppNavigation();
  const [destination, setDestination] =
    useState<RootRedirectDestination | null>(null);

  useEffect(() => {
    let cancelled = false;

    const resolveDestination = async () => {
      if (loading || !config) {
        return;
      }

      if (!config.remote_onboarding_acknowledged) {
        setDestination({ kind: 'onboarding' });
        return;
      }

      if (loginStatus?.status !== 'loggedin') {
        setDestination(DEFAULT_DESTINATION);
        return;
      }

      const firstProjectDestination =
        await getFirstProjectDestination(setSelectedOrgId);
      if (!cancelled) {
        setDestination(
          firstProjectDestination?.kind === 'project'
            ? firstProjectDestination
            : DEFAULT_DESTINATION
        );
      }
    };

    void resolveDestination();

    return () => {
      cancelled = true;
    };
  }, [appNavigation, config, loading, loginStatus?.status, setSelectedOrgId]);

  useEffect(() => {
    if (loading || !config || !destination) {
      return;
    }

    switch (destination.kind) {
      case 'onboarding':
        appNavigation.goToOnboarding({ replace: true });
        return;
      case 'workspaces-create':
        appNavigation.goToWorkspacesCreate({ replace: true });
        return;
      case 'project':
        appNavigation.goToProject(destination.projectId, { replace: true });
        return;
    }
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
