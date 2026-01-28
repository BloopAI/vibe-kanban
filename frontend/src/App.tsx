import { useEffect, useState, useCallback } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { Projects } from '@/pages/Projects';
import { ProjectTasks } from '@/pages/ProjectTasks';
import { FullAttemptLogsPage } from '@/pages/FullAttemptLogs';
import { Login } from '@/pages/Login';
import { NormalLayout } from '@/components/layout/NormalLayout';
import { NewDesignLayout } from '@/components/layout/NewDesignLayout';
import { usePostHog } from 'posthog-js/react';
import { useAuth } from '@/hooks';
import { usePreviousPath } from '@/hooks/usePreviousPath';

import {
  AgentSettings,
  ClaudeTokenSettings,
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
import { LocalAuthProvider } from '@/contexts/LocalAuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';

import { HotkeysProvider } from 'react-hotkeys-hook';

import { ProjectProvider } from '@/contexts/ProjectContext';
import { ThemeMode } from 'shared/types';
import * as Sentry from '@sentry/react';

import { DisclaimerDialog } from '@/components/dialogs/global/DisclaimerDialog';
import { OnboardingDialog } from '@/components/dialogs/global/OnboardingDialog';
import { ReleaseNotesDialog } from '@/components/dialogs/global/ReleaseNotesDialog';
import { ClaudeTokenRequiredDialog } from '@/components/dialogs/global/ClaudeTokenRequiredDialog';
import { ClickedElementsProvider } from './contexts/ClickedElementsProvider';
import { claudeTokensApi } from '@/lib/api';
import { useLocalAuth } from '@/contexts/LocalAuthContext';

// Design scope components
import { LegacyDesignScope } from '@/components/legacy-design/LegacyDesignScope';
import { NewDesignScope } from '@/components/ui-new/scope/NewDesignScope';
import { TerminalProvider } from '@/contexts/TerminalContext';

// New design pages
import { Workspaces } from '@/pages/ui-new/Workspaces';
import { WorkspacesLanding } from '@/pages/ui-new/WorkspacesLanding';
import { ElectricTestPage } from '@/pages/ui-new/ElectricTestPage';

const SentryRoutes = Sentry.withSentryReactRouterV6Routing(Routes);

function AppContent() {
  const { config, analyticsUserId, updateAndSaveConfig } = useUserSystem();
  const posthog = usePostHog();
  const { isSignedIn } = useAuth();
  const { isAuthenticated, isLocalAuthConfigured } = useLocalAuth();
  const [hasClaudeToken, setHasClaudeToken] = useState<boolean | null>(null);

  // Track previous path for back navigation
  usePreviousPath();

  // Check Claude token status when authenticated
  const checkClaudeTokenStatus = useCallback(async () => {
    if (!isAuthenticated) {
      setHasClaudeToken(null);
      return;
    }
    try {
      const status = await claudeTokensApi.getMyStatus();
      setHasClaudeToken(status.has_token && !status.is_expired);
    } catch (error) {
      console.error('Failed to check Claude token status:', error);
      // If we can't check, assume no token to be safe
      setHasClaudeToken(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isLocalAuthConfigured && isAuthenticated) {
      checkClaudeTokenStatus();
    }
  }, [isLocalAuthConfigured, isAuthenticated, checkClaudeTokenStatus]);

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
      // Don't show dialogs on login page - NiceModal.Provider is not available there
      if (window.location.pathname === '/login') return;

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

      // 3) Claude Token - required after onboarding when authenticated
      // Only check if auth is configured and user is authenticated
      if (
        isLocalAuthConfigured &&
        isAuthenticated &&
        hasClaudeToken === false
      ) {
        await ClaudeTokenRequiredDialog.show();
        if (!cancelled) {
          // Refresh token status after dialog closes
          await checkClaudeTokenStatus();
        }
        ClaudeTokenRequiredDialog.hide();
        return;
      }

      // 4) Release notes - last step
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
  }, [
    config,
    isSignedIn,
    updateAndSaveConfig,
    isLocalAuthConfigured,
    isAuthenticated,
    hasClaudeToken,
    checkClaudeTokenStatus,
  ]);

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
            {/* ========== LOGIN ROUTE ========== */}
            <Route path="/login" element={<Login />} />

            {/* ========== LEGACY DESIGN ROUTES (Protected) ========== */}
            {/* VS Code full-page logs route (outside NormalLayout for minimal UI) */}
            <Route
              path="/projects/:projectId/tasks/:taskId/attempts/:attemptId/full"
              element={
                <ProtectedRoute>
                  <LegacyDesignScope>
                    <FullAttemptLogsPage />
                  </LegacyDesignScope>
                </ProtectedRoute>
              }
            />

            <Route
              element={
                <ProtectedRoute>
                  <LegacyDesignScope>
                    <NormalLayout />
                  </LegacyDesignScope>
                </ProtectedRoute>
              }
            >
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
                <Route path="repos" element={<ReposSettings />} />
                <Route
                  path="organizations"
                  element={<OrganizationSettings />}
                />
                <Route path="agents" element={<AgentSettings />} />
                <Route path="mcp" element={<McpSettings />} />
                <Route path="claude-token" element={<ClaudeTokenSettings />} />
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

            {/* ========== NEW DESIGN ROUTES (Protected) ========== */}
            <Route
              path="/workspaces"
              element={
                <ProtectedRoute>
                  <NewDesignScope>
                    <TerminalProvider>
                      <NewDesignLayout />
                    </TerminalProvider>
                  </NewDesignScope>
                </ProtectedRoute>
              }
            >
              <Route index element={<WorkspacesLanding />} />
              <Route path="create" element={<Workspaces />} />
              <Route path="electric-test" element={<ElectricTestPage />} />
              <Route path=":workspaceId" element={<Workspaces />} />
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
        <LocalAuthProvider>
          <ClickedElementsProvider>
            <ProjectProvider>
              <HotkeysProvider
                initiallyActiveScopes={['*', 'global', 'kanban']}
              >
                <AppContent />
              </HotkeysProvider>
            </ProjectProvider>
          </ClickedElementsProvider>
        </LocalAuthProvider>
      </UserSystemProvider>
    </BrowserRouter>
  );
}

export default App;
