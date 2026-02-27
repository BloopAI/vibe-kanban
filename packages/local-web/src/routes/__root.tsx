import { useEffect, type ReactNode } from 'react';
import { Outlet, createRootRoute, useLocation } from '@tanstack/react-router';
import { I18nextProvider } from 'react-i18next';
import { usePostHog } from 'posthog-js/react';
import { Provider as NiceModalProvider } from '@ebay/nice-modal-react';
import { ThemeMode } from 'shared/types';
import i18n from '@/i18n';
import { useUserSystem } from '@/shared/hooks/useUserSystem';
import { ThemeProvider } from '@web/app/providers/ThemeProvider';
import { usePreviousPath } from '@/shared/hooks/usePreviousPath';
import { useUiPreferencesScratch } from '@/shared/hooks/useUiPreferencesScratch';
import { ReleaseNotesDialog } from '@/shared/dialogs/global/ReleaseNotesDialog';
import { WorkspaceProvider } from '@/shared/providers/WorkspaceProvider';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';
import { ExecutionProcessesProvider } from '@/shared/providers/ExecutionProcessesProvider';
import { LogsPanelProvider } from '@/shared/providers/LogsPanelProvider';
import { ActionsProvider } from '@/shared/providers/ActionsProvider';
import '@/app/styles/new/index.css';

function ExecutionProcessesProviderWrapper({
  children,
}: {
  children: ReactNode;
}) {
  const { selectedSessionId } = useWorkspaceContext();
  return (
    <ExecutionProcessesProvider sessionId={selectedSessionId}>
      {children}
    </ExecutionProcessesProvider>
  );
}

function RootRouteComponent() {
  const { config, analyticsUserId, updateAndSaveConfig } = useUserSystem();
  const posthog = usePostHog();
  const location = useLocation();

  usePreviousPath();
  useUiPreferencesScratch();

  useEffect(() => {
    if (!posthog || !analyticsUserId) return;

    if (config?.analytics_enabled) {
      posthog.opt_in_capturing();
      posthog.identify(analyticsUserId);
      console.log('[Analytics] Analytics enabled and user identified');
    } else {
      posthog.opt_out_capturing();
      console.log('[Analytics] Analytics disabled by user preference');
    }
  }, [config?.analytics_enabled, analyticsUserId, posthog]);

  useEffect(() => {
    if (!config || !config.remote_onboarding_acknowledged) return;

    const pathname = location.pathname;
    if (pathname.startsWith('/onboarding') || pathname.startsWith('/migrate')) {
      return;
    }

    let cancelled = false;

    const showReleaseNotes = async () => {
      if (config.show_release_notes) {
        await ReleaseNotesDialog.show();
        if (!cancelled) {
          await updateAndSaveConfig({ show_release_notes: false });
        }
        ReleaseNotesDialog.hide();
      }
    };

    void showReleaseNotes();

    return () => {
      cancelled = true;
    };
  }, [config, updateAndSaveConfig, location.pathname]);

  return (
    <I18nextProvider i18n={i18n}>
      <ThemeProvider initialTheme={config?.theme || ThemeMode.SYSTEM}>
        <WorkspaceProvider>
          <ExecutionProcessesProviderWrapper>
            <LogsPanelProvider>
              <ActionsProvider>
                <NiceModalProvider>
                  <Outlet />
                </NiceModalProvider>
              </ActionsProvider>
            </LogsPanelProvider>
          </ExecutionProcessesProviderWrapper>
        </WorkspaceProvider>
      </ThemeProvider>
    </I18nextProvider>
  );
}

export const Route = createRootRoute({
  component: RootRouteComponent,
});
