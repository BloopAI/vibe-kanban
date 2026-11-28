import { useEffect } from 'react';
import { useUserSystem } from '@/shared/hooks/useUserSystem';
import { useCloudAvailable } from '@/shared/hooks/useCloudAvailability';
import { getFirstProjectDestination } from '@/shared/lib/firstProjectDestination';
import { useOrganizationStore } from '@/shared/stores/useOrganizationStore';
import { useUiPreferencesStore } from '@/shared/stores/useUiPreferencesStore';
import { useAppNavigation } from '@/shared/hooks/useAppNavigation';
import { getRootDestination } from './rootDestination';

export function RootRedirectPage() {
  const { config, loading, loginStatus } = useUserSystem();
  const cloudAvailable = useCloudAvailable();
  const setSelectedOrgId = useOrganizationStore((s) => s.setSelectedOrgId);
  const appNavigation = useAppNavigation();

  useEffect(() => {
    if (loading || !config) {
      return;
    }

    let isActive = true;
    void (async () => {
      const destination = await getRootDestination(
        {
          onboardingAcknowledged: config.remote_onboarding_acknowledged,
          isSignedIn: loginStatus?.status === 'loggedin',
          cloudAvailable,
        },
        () => {
          // Read saved selections imperatively to avoid re-triggering this
          // effect when the scratch store initializes from the server
          const { selectedOrgId, selectedProjectId } =
            useUiPreferencesStore.getState();
          return getFirstProjectDestination(
            setSelectedOrgId,
            selectedOrgId,
            selectedProjectId
          );
        }
      );
      if (!isActive) {
        return;
      }

      switch (destination.kind) {
        case 'onboarding':
          appNavigation.goToOnboarding({ replace: true });
          return;
        case 'project':
          appNavigation.goToProject(destination.projectId, { replace: true });
          return;
        case 'workspaces-create':
          appNavigation.goToWorkspacesCreate({ replace: true });
          return;
      }
    })();

    return () => {
      isActive = false;
    };
  }, [
    appNavigation,
    cloudAvailable,
    config,
    loading,
    loginStatus?.status,
    setSelectedOrgId,
  ]);

  return (
    <div className="h-screen bg-primary flex items-center justify-center">
      <p className="text-low">Loading...</p>
    </div>
  );
}
