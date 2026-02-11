import { useEffect } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { Projects } from '@/pages/Projects';
import { ProjectTasks } from '@/pages/ProjectTasks';
import { FullAttemptLogsPage } from '@/pages/FullAttemptLogs';
import { Migration } from '@/pages/Migration';
import { NormalLayout } from '@/components/layout/NormalLayout';
import { SharedAppLayout } from '@/components/ui-new/containers/SharedAppLayout';
import { usePostHog } from 'posthog-js/react';
import { usePreviousPath } from '@/hooks/usePreviousPath';
import { useUiPreferencesScratch } from '@/hooks/useUiPreferencesScratch';

import {
  AgentSettings,
  GeneralSettings,
  McpSettings,
  OrganizationSettings,
  ProjectSettings,
  ReposSettings,
  SettingsLayout,
} from '@/pages/settings/';
import { UserSystemProvider, useUserSystem } from '@/components/ConfigProvider';
import { ThemeProvider } from '@/components/ThemeProvider';
import { SearchProvider } from '@/contexts/SearchContext';

import { HotkeysProvider } from 'react-hotkeys-hook';

import { ProjectProvider } from '@/contexts/ProjectContext';
import { ThemeMode } from 'shared/types';
import * as Sentry from '@sentry/react';

import { ReleaseNotesDialog } from '@/components/dialogs/global/ReleaseNotesDialog';
import { ClickedElementsProvider } from './contexts/ClickedElementsProvider';

// Design scope components
import { LegacyDesignScope } from '@/components/legacy-design/LegacyDesignScope';
import { NewDesignScope } from '@/components/ui-new/scope/NewDesignScope';
import { VSCodeScope } from '@/components/ui-new/scope/VSCodeScope';
import { TerminalProvider } from '@/contexts/TerminalContext';

// New design pages
import { Workspaces } from '@/pages/ui-new/Workspaces';
import { VSCodeWorkspacePage } from '@/pages/ui-new/VSCodeWorkspacePage';
import { WorkspacesLanding } from '@/pages/ui-new/WorkspacesLanding';
import { ElectricTestPage } from '@/pages/ui-new/ElectricTestPage';
import { ProjectKanban } from '@/pages/ui-new/ProjectKanban';
import { MigratePage } from '@/pages/ui-new/MigratePage';
import { LandingPage } from '@/pages/ui-new/LandingPage';
import { OnboardingSignInPage } from '@/pages/ui-new/OnboardingSignInPage';
import { RootRedirectPage } from '@/pages/ui-new/RootRedirectPage';

const SentryRoutes = Sentry.withSentryReactRouterV6Routing(Routes);

function AppContent() {
  const { config, analyticsUserId, updateAndSaveConfig } = useUserSystem();
  const posthog = usePostHog();
  const location = useLocation();

  // Track previous path for back navigation
  usePreviousPath();

  // Sync UI preferences with server scratch storage
  useUiPreferencesScratch();

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
    if (!config || !config.remote_onboarding_acknowledged) return;

    // Don't show release notes during onboarding or migration flows
    const pathname = location.pathname;
    if (pathname.startsWith('/onboarding') || pathname.startsWith('/migrate'))
      return;

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

    showReleaseNotes();

    return () => {
      cancelled = true;
    };
  }, [config, updateAndSaveConfig, location.pathname]);

  // TODO: Disabled while developing FE only
  // if (loading) {
  //   return (
  //     <div className="min-h-screen bg-background flex items-center justify-center">
  //       <Loader message="Loading..." size={32} />
  //     </div>
  //   );
  // }

  return (
    <I18nextProvider i18n={i18n}>
      <ThemeProvider initialTheme={config?.theme || ThemeMode.SYSTEM}>
        <SearchProvider>
          <SentryRoutes>
            <Route
              path="/"
              element={
                <NewDesignScope>
                  <RootRedirectPage />
                </NewDesignScope>
              }
            />
            <Route
              path="/onboarding"
              element={
                <NewDesignScope>
                  <LandingPage />
                </NewDesignScope>
              }
            />
            <Route
              path="/onboarding/sign-in"
              element={
                <NewDesignScope>
                  <OnboardingSignInPage />
                </NewDesignScope>
              }
            />

            {/* ========== LEGACY DESIGN ROUTES ========== */}
            {/* VS Code full-page logs route (outside NormalLayout for minimal UI) */}
            <Route
              path="/local-projects/:projectId/tasks/:taskId/attempts/:attemptId/full"
              element={
                <LegacyDesignScope>
                  <FullAttemptLogsPage />
                </LegacyDesignScope>
              }
            />

            <Route
              element={
                <LegacyDesignScope>
                  <NormalLayout />
                </LegacyDesignScope>
              }
            >
              <Route path="/local-projects" element={<Projects />} />
              <Route path="/local-projects/:projectId" element={<Projects />} />
              <Route path="/migration" element={<Migration />} />
              <Route
                path="/local-projects/:projectId/tasks"
                element={<ProjectTasks />}
              />
              <Route path="/settings/*" element={<SettingsLayout />}>
                <Route index element={<Navigate to="general" replace />} />
                <Route path="general" element={<GeneralSettings />} />
                <Route path="projects" element={<ProjectSettings />} />
                <Route path="repos" element={<ReposSettings />} />
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
                path="/local-projects/:projectId/tasks/:taskId"
                element={<ProjectTasks />}
              />
              <Route
                path="/local-projects/:projectId/tasks/:taskId/attempts/:attemptId"
                element={<ProjectTasks />}
              />
            </Route>

            {/* ========== NEW DESIGN ROUTES ========== */}
            {/* VS Code workspace route (standalone, no layout, no keyboard shortcuts) */}
            <Route
              path="/workspaces/:workspaceId/vscode"
              element={
                <VSCodeScope>
                  <TerminalProvider>
                    <VSCodeWorkspacePage />
                  </TerminalProvider>
                </VSCodeScope>
              }
            />

            {/* Unified layout for workspaces and projects - AppBar/Navbar rendered once */}
            <Route
              element={
                <NewDesignScope>
                  <TerminalProvider>
                    <SharedAppLayout />
                  </TerminalProvider>
                </NewDesignScope>
              }
            >
              {/* Workspaces routes */}
              <Route path="/workspaces" element={<WorkspacesLanding />} />
              <Route path="/workspaces/create" element={<Workspaces />} />
              <Route
                path="/workspaces/electric-test"
                element={<ElectricTestPage />}
              />
              <Route path="/workspaces/:workspaceId" element={<Workspaces />} />

              {/* Projects routes */}
              <Route path="/projects/:projectId" element={<ProjectKanban />} />
              <Route
                path="/projects/:projectId/issues/new"
                element={<ProjectKanban />}
              />
              <Route
                path="/projects/:projectId/issues/:issueId"
                element={<ProjectKanban />}
              />
              <Route
                path="/projects/:projectId/issues/:issueId/workspaces/:workspaceId"
                element={<ProjectKanban />}
              />
              <Route
                path="/projects/:projectId/issues/:issueId/workspaces/create/:draftId"
                element={<ProjectKanban />}
              />
              <Route
                path="/projects/:projectId/workspaces/create/:draftId"
                element={<ProjectKanban />}
              />

              {/* Migration route */}
              <Route path="/migrate" element={<MigratePage />} />
            </Route>
          </SentryRoutes>
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
            <HotkeysProvider
              initiallyActiveScopes={[
                'global',
                'workspace',
                'kanban',
                'projects',
              ]}
            >
              <AppContent />
            </HotkeysProvider>
          </ProjectProvider>
        </ClickedElementsProvider>
      </UserSystemProvider>
    </BrowserRouter>
  );
}

export default App;
