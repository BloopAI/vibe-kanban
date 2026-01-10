import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { Projects } from '@/pages/Projects';
import { ProjectTasks } from '@/pages/ProjectTasks';
import { TeamIssues } from '@/pages/TeamIssues';
import { TeamProjects } from '@/pages/TeamProjects';
import { TeamProjectDetail } from '@/pages/TeamProjectDetail';
import { TeamDocuments } from '@/pages/TeamDocuments';
import { TeamMembers } from '@/pages/TeamMembers';
import { JoinTeam } from '@/pages/JoinTeam';
import { NewWorkspace } from '@/pages/workspace';
import { FullAttemptLogsPage } from '@/pages/FullAttemptLogs';
import { About } from '@/pages/About';
import { Views } from '@/pages/Views';
import { LandingPage } from '@/pages/LandingPage';
import { MyIssues } from '@/pages/MyIssues';
import { Inbox } from '@/pages/Inbox';
import { NormalLayout } from '@/components/layout/NormalLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { usePostHog } from 'posthog-js/react';
import { useAuth } from '@/hooks';
import { usePreviousPath } from '@/hooks/usePreviousPath';

import {
  AgentSettings,
  ApiKeysSettings,
  GeneralSettings,
  McpSettings,
  OrganizationSettings,
  ProjectSettings,
  SettingsLayout,
  WorkspaceSettings,
} from '@/pages/settings/';
import { UserSystemProvider, useUserSystem } from '@/components/ConfigProvider';
import { ThemeProvider } from '@/components/ThemeProvider';
import { SearchProvider } from '@/contexts/SearchContext';

import { HotkeysProvider } from 'react-hotkeys-hook';

import { ProjectProvider } from '@/contexts/ProjectContext';
import { WorkspaceProvider } from '@/contexts/WorkspaceContext';
import { ThemeMode } from 'shared/types';
import * as Sentry from '@sentry/react';
import { Loader } from '@/components/ui/loader';
import { BackendErrorState } from '@/components/ui/BackendErrorState';
import { ConnectionStatusBar } from '@/components/ui/connection-status-bar';

import { DisclaimerDialog } from '@/components/dialogs/global/DisclaimerDialog';
import { OnboardingDialog } from '@/components/dialogs/global/OnboardingDialog';
import { ReleaseNotesDialog } from '@/components/dialogs/global/ReleaseNotesDialog';
import { ClickedElementsProvider } from './contexts/ClickedElementsProvider';
import { SidebarProvider } from './contexts/SidebarContext';
import { GlobalKeyboardShortcuts } from '@/components/layout/GlobalKeyboardShortcuts';
import NiceModal from '@ebay/nice-modal-react';

const SentryRoutes = Sentry.withSentryReactRouterV6Routing(Routes);

function AppContent() {
  const { config, analyticsUserId, updateAndSaveConfig, loading, isError, error, reloadSystem } =
    useUserSystem();
  const posthog = usePostHog();
  const { isSignedIn } = useAuth();

  // Track previous path for back navigation
  usePreviousPath();

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

  // Only show full error state if we have no cached config at all
  // If we have cached data, show the app in degraded mode instead
  if (isError && !config) {
    return (
      <BackendErrorState
        error={error}
        onRetry={() => reloadSystem()}
      />
    );
  }

  return (
    <I18nextProvider i18n={i18n}>
      <ThemeProvider initialTheme={config?.theme || ThemeMode.SYSTEM}>
        <SearchProvider>
          <GlobalKeyboardShortcuts />
          {/* Connection status bar - shows when degraded or offline */}
          <ConnectionStatusBar />
          <div className="h-screen flex flex-col bg-background">
            <SentryRoutes>
              {/* Public routes - no authentication required */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/about" element={<About />} />

              {/* Join team via invite link (standalone page) */}
              <Route path="/join" element={<JoinTeam />} />

              {/* Workspace setup wizard (standalone page) */}
              <Route
                path="/workspace/new"
                element={
                  <ProtectedRoute>
                    <NewWorkspace />
                  </ProtectedRoute>
                }
              />

              {/* VS Code full-page logs route (outside NormalLayout for minimal UI) */}
              <Route
                path="/projects/:projectId/tasks/:taskId/attempts/:attemptId/full"
                element={
                  <ProtectedRoute>
                    <FullAttemptLogsPage />
                  </ProtectedRoute>
                }
              />

              <Route
                element={
                  <ProtectedRoute>
                    <NormalLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="/projects" element={<Projects />} />
                <Route path="/projects/:projectId" element={<Projects />} />
                <Route path="/inbox" element={<Inbox />} />
                <Route path="/my-issues" element={<MyIssues />} />
                <Route path="/views" element={<Views />} />
                <Route path="/views/new" element={<Views />} />
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
                  <Route path="workspace" element={<WorkspaceSettings />} />
                  <Route path="agents" element={<AgentSettings />} />
                  <Route path="mcp" element={<McpSettings />} />
                  <Route path="api-keys" element={<ApiKeysSettings />} />
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
                {/* Team routes */}
                <Route path="/teams/:teamId" element={<Navigate to="issues" replace />} />
                <Route path="/teams/:teamId/issues" element={<TeamIssues />} />
                <Route path="/teams/:teamId/projects" element={<TeamProjects />} />
                <Route path="/teams/:teamId/projects/:projectId" element={<TeamProjectDetail />} />
                <Route path="/teams/:teamId/documents" element={<TeamDocuments />} />
                <Route path="/teams/:teamId/members" element={<TeamMembers />} />
                <Route path="/teams/:teamId/github" element={<Navigate to="/settings/organization" replace />} />
                <Route path="/teams/:teamId/views" element={<Views />} />
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
          <WorkspaceProvider>
            <ProjectProvider>
              <SidebarProvider>
                <HotkeysProvider initiallyActiveScopes={['*', 'global', 'kanban']}>
                  <NiceModal.Provider>
                    <AppContent />
                  </NiceModal.Provider>
                </HotkeysProvider>
              </SidebarProvider>
            </ProjectProvider>
          </WorkspaceProvider>
        </ClickedElementsProvider>
      </UserSystemProvider>
    </BrowserRouter>
  );
}

export default App;
