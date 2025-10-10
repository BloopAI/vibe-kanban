import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { Navbar } from '@/components/layout/navbar';
import { Projects } from '@/pages/projects';
import { ProjectTasks } from '@/pages/project-tasks';
import { useTaskViewManager } from '@/hooks/useTaskViewManager';
import { usePreviousPath } from '@/hooks/usePreviousPath';

import {
  AgentSettings,
  GeneralSettings,
  McpSettings,
  SettingsLayout,
} from '@/pages/settings/';
import {
  UserSystemProvider,
  useUserSystem,
} from '@/components/config-provider';
import { ThemeProvider } from '@/components/theme-provider';
import { SearchProvider } from '@/contexts/search-context';
import { KeyboardShortcutsProvider } from '@/contexts/keyboard-shortcuts-context';

import { ShortcutsHelp } from '@/components/shortcuts-help';
import { HotkeysProvider } from 'react-hotkeys-hook';

import { ProjectProvider } from '@/contexts/project-context';
import { ThemeMode } from 'shared/types';
import * as Sentry from '@sentry/react';
import { Loader } from '@/components/ui/loader';

import { AppWithStyleOverride } from '@/utils/style-override';
import { WebviewContextMenu } from '@/vscode/ContextMenu';
import { DevBanner } from '@/components/DevBanner';
import NiceModal from '@ebay/nice-modal-react';
import { UnifiedOnboardingResult } from './components/dialogs/global/UnifiedOnboardingDialog';
import { ClickedElementsProvider } from './contexts/ClickedElementsProvider';

const SentryRoutes = Sentry.withSentryReactRouterV6Routing(Routes);

function AppContent() {
  const { config, updateAndSaveConfig, loading } = useUserSystem();
  const { isFullscreen } = useTaskViewManager();

  // Track previous path for back navigation
  usePreviousPath();

  const showNavbar = !isFullscreen;

  useEffect(() => {
    let cancelled = false;

    const handleUnifiedOnboardingComplete = async (
      result: UnifiedOnboardingResult
    ) => {
      if (cancelled) return;
      const updatedConfig = {
        ...config,
        onboarding_acknowledged: true,
        disclaimer_acknowledged: result.disclaimerAccepted,
        telemetry_acknowledged: true,
        analytics_enabled: result.analyticsEnabled,
        github_login_acknowledged: result.githubLoginAcknowledged,
        executor_profile: result.profile,
        editor: result.editor,
      };

      await updateAndSaveConfig(updatedConfig);
    };

    const handleReleaseNotesClose = async () => {
      if (cancelled) return;
      await updateAndSaveConfig({ show_release_notes: false });
    };

    const checkOnboardingSteps = async () => {
      if (!config || cancelled) return;

      // Check if we need to show the unified onboarding dialog
      if (
        !config.onboarding_acknowledged ||
        !config.disclaimer_acknowledged ||
        !config.telemetry_acknowledged ||
        !config.github_login_acknowledged
      ) {
        const result: UnifiedOnboardingResult =
          await NiceModal.show('unified-onboarding');
        await handleUnifiedOnboardingComplete(result);
        await NiceModal.hide('unified-onboarding');
      }

      // Show release notes if needed (this remains separate)
      if (config.show_release_notes) {
        await NiceModal.show('release-notes');
        await handleReleaseNotesClose();
        await NiceModal.hide('release-notes');
      }
    };

    const runOnboarding = async () => {
      if (!config || cancelled) return;
      await checkOnboardingSteps();
    };

    runOnboarding();

    return () => {
      cancelled = true;
    };
  }, [config]);

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
        <AppWithStyleOverride>
          <SearchProvider>
            <div className="h-screen flex flex-col bg-background">
              {/* Custom context menu and VS Code-friendly interactions when embedded in iframe */}
              <WebviewContextMenu />

              {showNavbar && <DevBanner />}
              {showNavbar && <Navbar />}
              <div className="flex-1 h-full overflow-y-scroll">
                <SentryRoutes>
                  <Route path="/" element={<Projects />} />
                  <Route path="/projects" element={<Projects />} />
                  <Route path="/projects/:projectId" element={<Projects />} />
                  <Route
                    path="/projects/:projectId/tasks"
                    element={<ProjectTasks />}
                  />
                  <Route
                    path="/projects/:projectId/tasks/:taskId/attempts/:attemptId"
                    element={<ProjectTasks />}
                  />
                  <Route
                    path="/projects/:projectId/tasks/:taskId/attempts/:attemptId/full"
                    element={<ProjectTasks />}
                  />
                  <Route
                    path="/projects/:projectId/tasks/:taskId/full"
                    element={<ProjectTasks />}
                  />
                  <Route
                    path="/projects/:projectId/tasks/:taskId"
                    element={<ProjectTasks />}
                  />
                  <Route path="/settings/*" element={<SettingsLayout />}>
                    <Route index element={<Navigate to="general" replace />} />
                    <Route path="general" element={<GeneralSettings />} />
                    <Route path="agents" element={<AgentSettings />} />
                    <Route path="mcp" element={<McpSettings />} />
                  </Route>
                  {/* Redirect old MCP route */}
                  <Route
                    path="/mcp-servers"
                    element={<Navigate to="/settings/mcp" replace />}
                  />
                </SentryRoutes>
              </div>
            </div>
            <ShortcutsHelp />
          </SearchProvider>
        </AppWithStyleOverride>
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
              <KeyboardShortcutsProvider>
                <NiceModal.Provider>
                  <AppContent />
                </NiceModal.Provider>
              </KeyboardShortcutsProvider>
            </HotkeysProvider>
          </ProjectProvider>
        </ClickedElementsProvider>
      </UserSystemProvider>
    </BrowserRouter>
  );
}

export default App;
