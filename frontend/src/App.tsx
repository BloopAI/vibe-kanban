import { useEffect } from 'react';
import {
  BrowserRouter,
  Route,
  Routes,
  useLocation,
  Navigate,
} from 'react-router-dom';
import { Navbar } from '@/components/layout/navbar';
import { Projects } from '@/pages/projects';
import { ProjectTasks } from '@/pages/project-tasks';

import {
  SettingsLayout,
  GeneralSettings,
  AgentSettings,
  McpSettings,
} from '@/pages/settings/';
import { ConfigProvider, useConfig } from '@/components/config-provider';
import { ThemeProvider } from '@/components/theme-provider';
import { SearchProvider } from '@/contexts/search-context';
import { EditorDialogProvider } from '@/contexts/editor-dialog-context';

import { TaskDialogProvider } from '@/contexts/task-dialog-context';
import { TaskFormDialogContainer } from '@/components/dialogs';
import { ProjectProvider } from '@/contexts/project-context';
import type { EditorType } from 'shared/types';
import { ThemeMode } from 'shared/types';
import type { ExecutorProfileId } from 'shared/types';
import { configApi } from '@/lib/api';
import * as Sentry from '@sentry/react';
import { Loader } from '@/components/ui/loader';

import { AppWithStyleOverride } from '@/utils/style-override';
import { WebviewContextMenu } from '@/vscode/ContextMenu';
import { DevBanner } from '@/components/DevBanner';
import NiceModal from '@ebay/nice-modal-react';

const SentryRoutes = Sentry.withSentryReactRouterV6Routing(Routes);

function AppContent() {
  const { config, updateConfig, loading } = useConfig();
  const location = useLocation();

  const showNavbar = !location.pathname.endsWith('/full');

  useEffect(() => {
    if (config) {
      // Handle disclaimer with nice-modal-react
      if (!config.disclaimer_acknowledged) {
        NiceModal.show('disclaimer').then((result) => {
          if (result === 'accepted') {
            handleDisclaimerAccept();
          }
        });
      } else if (!config.onboarding_acknowledged) {
        NiceModal.show('onboarding').then((result) => {
          if (result !== 'canceled') {
            handleOnboardingComplete(
              result as {
                profile: ExecutorProfileId;
                editor: {
                  editor_type: EditorType;
                  custom_command: string | null;
                };
              }
            );
          }
        });
      } else if (!config.github_login_acknowledged) {
        NiceModal.show('github-login').then(() => handleGitHubLoginComplete());
      } else if (!config.telemetry_acknowledged) {
        NiceModal.show('privacy-opt-in').then((result) => {
          handlePrivacyOptInComplete(result as boolean);
        });
      } else if (config.show_release_notes) {
        NiceModal.show('release-notes').then(() => {
          handleReleaseNotesClose();
        });
      }
    }
  }, [config]);

  const handleDisclaimerAccept = async () => {
    if (!config) return;

    updateConfig({ disclaimer_acknowledged: true });

    try {
      await configApi.saveConfig({ ...config, disclaimer_acknowledged: true });
      // Trigger onboarding after disclaimer is accepted
      if (!config.onboarding_acknowledged) {
        NiceModal.show('onboarding').then((result) => {
          if (result !== 'canceled') {
            handleOnboardingComplete(
              result as {
                profile: ExecutorProfileId;
                editor: {
                  editor_type: EditorType;
                  custom_command: string | null;
                };
              }
            );
          }
        });
      }
    } catch (err) {
      console.error('Error saving config:', err);
    }
  };

  const handleOnboardingComplete = async (onboardingConfig: {
    profile: ExecutorProfileId;
    editor: { editor_type: EditorType; custom_command: string | null };
  }) => {
    if (!config) return;

    const updatedConfig = {
      ...config,
      onboarding_acknowledged: true,
      executor_profile: onboardingConfig.profile,
      editor: onboardingConfig.editor,
    };

    updateConfig(updatedConfig);

    try {
      await configApi.saveConfig(updatedConfig);
    } catch (err) {
      console.error('Error saving config:', err);
    }
  };

  const handlePrivacyOptInComplete = async (telemetryEnabled: boolean) => {
    if (!config) return;

    const updatedConfig = {
      ...config,
      telemetry_acknowledged: true,
      analytics_enabled: telemetryEnabled,
    };

    updateConfig(updatedConfig);

    try {
      await configApi.saveConfig(updatedConfig);
    } catch (err) {
      console.error('Error saving config:', err);
    }
  };

  const handleGitHubLoginComplete = async () => {
    try {
      // Refresh the config to get the latest GitHub authentication state
      const latestUserSystem = await configApi.getConfig();
      updateConfig(latestUserSystem.config);

      // If user skipped (no GitHub token), we need to manually set the acknowledgment
      const updatedConfig = {
        ...latestUserSystem.config,
        github_login_acknowledged: true,
      };
      updateConfig(updatedConfig);
      await configApi.saveConfig(updatedConfig);
    } catch (err) {
      console.error('Error refreshing config:', err);
    }
  };

  const handleReleaseNotesClose = async () => {
    if (!config) return;

    const updatedConfig = {
      ...config,
      show_release_notes: false,
    };

    updateConfig(updatedConfig);

    try {
      await configApi.saveConfig(updatedConfig);
    } catch (err) {
      console.error('Error saving config:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader message="Loading..." size={32} />
      </div>
    );
  }

  return (
    <ThemeProvider initialTheme={config?.theme || ThemeMode.SYSTEM}>
      <AppWithStyleOverride>
        <SearchProvider>
          <div className="h-screen flex flex-col bg-background">
            {/* Custom context menu and VS Code-friendly interactions when embedded in iframe */}
            <WebviewContextMenu />

            <TaskFormDialogContainer />
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
        </SearchProvider>
      </AppWithStyleOverride>
    </ThemeProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ConfigProvider>
        <ProjectProvider>
          <NiceModal.Provider>
            <EditorDialogProvider>
              <TaskDialogProvider>
                <AppContent />
              </TaskDialogProvider>
            </EditorDialogProvider>
          </NiceModal.Provider>
        </ProjectProvider>
      </ConfigProvider>
    </BrowserRouter>
  );
}

export default App;
