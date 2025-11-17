import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { Projects } from '@/pages/projects';
import { ProjectTasks } from '@/pages/project-tasks';
import { FullAttemptLogsPage } from '@/pages/full-attempt-logs';
import { NormalLayout } from '@/components/layout/NormalLayout';
import { usePostHog } from 'posthog-js/react';
import { useAuth } from '@/hooks';

import {
  AgentSettings,
  GeneralSettings,
  McpSettings,
  OrganizationSettings,
  ProjectSettings,
  SettingsLayout,
} from '@/pages/settings/';
import {
  UserSystemProvider,
  useUserSystem,
} from '@/components/config-provider';
import { ThemeProvider } from '@/components/theme-provider';
import { SearchProvider } from '@/contexts/search-context';

import { HotkeysProvider } from 'react-hotkeys-hook';

import { ProjectProvider } from '@/contexts/project-context';
import { ThemeMode } from 'shared/types';
import * as Sentry from '@sentry/react';
import { Loader } from '@/components/ui/loader';

import { DisclaimerDialog } from '@/components/dialogs/global/DisclaimerDialog';
import { OnboardingDialog } from '@/components/dialogs/global/OnboardingDialog';
import { ReleaseNotesDialog } from '@/components/dialogs/global/ReleaseNotesDialog';
import { ClickedElementsProvider } from './contexts/ClickedElementsProvider';
import NiceModal from '@ebay/nice-modal-react';

const SentryRoutes = Sentry.withSentryReactRouterV6Routing(Routes);

function AppContent() {
  const { config, analyticsUserId, updateAndSaveConfig, loading } =
    useUserSystem();
  const posthog = usePostHog();
  const { isSignedIn } = useAuth();

  // Handle opt-in/opt-out and user identification when config loads
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
    if (!config) return;
    let cancelled = false;

    const showNextStep = async () => {
      // 1) Disclaimer - first step
      if (!config.disclaimer_acknowledged) {
        await DisclaimerDialog.show();
        if (!cancelled) {
          await updateAndSaveConfig({ disclaimer_acknowledged: true });
        }
        DisclaimerDialog.hide();
        return;
      }

      // 2) Onboarding - configure executor and editor
      if (!config.onboarding_acknowledged) {
        const result = await OnboardingDialog.show();
        if (!cancelled) {
          await updateAndSaveConfig({
            onboarding_acknowledged: true,
            executor_profile: result.profile,
            editor: result.editor,
          });
        }
        OnboardingDialog.hide();
        return;
      }

      // 3) Release notes - last step
      if (config.show_release_notes) {
        await ReleaseNotesDialog.show();
        if (!cancelled) {
          await updateAndSaveConfig({ show_release_notes: false });
        }
        ReleaseNotesDialog.hide();
        return;
      }
    };

    showNextStep();

    return () => {
      cancelled = true;
    };
  }, [config, isSignedIn, updateAndSaveConfig]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader message="Loading..." size={32} />
      </div>
    );
  }

  return (
    <I18nextProvider i18n={i18n}>
      <ThemeProvider initialTheme={config?.theme || ThemeMode.SYSTEM}>
        <SearchProvider>
          <div className="h-screen flex flex-col bg-background">
            <SentryRoutes>
              {/* VS Code full-page logs route (outside NormalLayout for minimal UI) */}
              <Route
                path="/projects/:projectId/tasks/:taskId/attempts/:attemptId/full"
                element={<FullAttemptLogsPage />}
              />

              <Route element={<NormalLayout />}>
                <Route path="/" element={<Projects />} />
                <Route path="/projects" element={<Projects />} />
                <Route path="/projects/:projectId" element={<Projects />} />
                <Route
                  path="/projects/:projectId/tasks"
                  element={<ProjectTasks />}
                />
                <Route path="/settings/*" element={<SettingsLayout />}>
                  <Route index element={<Navigate to="general" replace />} />
                  <Route path="general" element={<GeneralSettings />} />
                  <Route path="projects" element={<ProjectSettings />} />
                  <Route
                    path="organizations"
                    element={<OrganizationSettings />}
                  />
                  <Route path="agents" element={<AgentSettings />} />
                  <Route path="mcp" element={<McpSettings />} />
                </Route>
                <Route
                  path="/mcp-servers"
                  element={<Navigate to="/settings/mcp" replace />}
                />
                <Route
                  path="/projects/:projectId/tasks/:taskId"
                  element={<ProjectTasks />}
                />
                <Route
                  path="/projects/:projectId/tasks/:taskId/attempts/:attemptId"
                  element={<ProjectTasks />}
                />
              </Route>
            </SentryRoutes>
          </div>
        </SearchProvider>
      </ThemeProvider>
    </I18nextProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <UserSystemProvider>
        <ClickedElementsProvider>
          <ProjectProvider>
            <HotkeysProvider initiallyActiveScopes={['*', 'global', 'kanban']}>
              <NiceModal.Provider>
                <AppContent />
              </NiceModal.Provider>
            </HotkeysProvider>
          </ProjectProvider>
        </ClickedElementsProvider>
      </UserSystemProvider>
    </BrowserRouter>
  );
}

export default App;
