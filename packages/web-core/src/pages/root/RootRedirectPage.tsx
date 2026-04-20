import { useEffect } from 'react';
import { useUserSystem } from '@/shared/hooks/useUserSystem';
import { useAppNavigation } from '@/shared/hooks/useAppNavigation';
import { kanbanProjectsApi } from '@/shared/lib/kanbanApi';

export function RootRedirectPage() {
  const { config, loading } = useUserSystem();
  const appNavigation = useAppNavigation();

  useEffect(() => {
    if (loading || !config) {
      return;
    }

    let isActive = true;
    void (async () => {
      if (!config.remote_onboarding_acknowledged) {
        appNavigation.goToOnboarding({ replace: true });
        return;
      }

      // Local-first: try to redirect to the first local kanban project.
      try {
        const projects = await kanbanProjectsApi.list();
        if (!isActive) return;
        if (projects.length > 0) {
          appNavigation.goToProject(projects[0].id, { replace: true });
          return;
        }
      } catch {
        // If the API isn't ready yet, fall through to workspace create.
      }

      if (isActive) {
        appNavigation.goToWorkspacesCreate({ replace: true });
      }
    })();

    return () => {
      isActive = false;
    };
  }, [appNavigation, config, loading]);

  return (
    <div className="h-screen bg-primary flex items-center justify-center">
      <p className="text-low">Loading...</p>
    </div>
  );
}
