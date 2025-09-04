import { useEffect, useState } from 'react';
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
import { DisclaimerDialog } from '@/components/DisclaimerDialog';
import { OnboardingDialog } from '@/components/OnboardingDialog';
import { PrivacyOptInDialog } from '@/components/PrivacyOptInDialog';
import { ConfigProvider, useConfig } from '@/components/config-provider';
import { ThemeProvider } from '@/components/theme-provider';
import { SearchProvider } from '@/contexts/search-context';
import {
  EditorDialogProvider,
  useEditorDialog,
} from '@/contexts/editor-dialog-context';
import { CreatePRDialogProvider } from '@/contexts/create-pr-dialog-context';
import { EditorSelectionDialog } from '@/components/tasks/EditorSelectionDialog';
import CreatePRDialog from '@/components/tasks/Toolbar/CreatePRDialog';
import { TaskDialogProvider } from '@/contexts/task-dialog-context';
import { TaskFormDialogContainer } from '@/components/tasks/TaskFormDialogContainer';
import { ProjectProvider } from '@/contexts/project-context';
import type { EditorType } from 'shared/types';
import { ThemeMode } from 'shared/types';
import type { ExecutorProfileId } from 'shared/types';
import { configApi } from '@/lib/api';
import * as Sentry from '@sentry/react';
import { Loader } from '@/components/ui/loader';
import { GitHubLoginDialog } from '@/components/GitHubLoginDialog';
import { ReleaseNotesDialog } from '@/components/ReleaseNotesDialog';
import { AppWithStyleOverride } from '@/utils/style-override';
import { WebviewContextMenu } from '@/vscode/ContextMenu';
import { DevBanner } from '@/components/DevBanner';

const SentryRoutes = Sentry.withSentryReactRouterV6Routing(Routes);

function AppContent() {
  const { config, updateConfig, loading } = useConfig();
  const location = useLocation();
  const {
    isOpen: editorDialogOpen,
    selectedAttempt,
    closeEditorDialog,
  } = useEditorDialog();
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showPrivacyOptIn, setShowPrivacyOptIn] = useState(false);
  const [showGitHubLogin, setShowGitHubLogin] = useState(false);
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  const showNavbar = !location.pathname.endsWith('/full');

  useEffect(() => {
    if (config) {
      setShowDisclaimer(!config.disclaimer_acknowledged);
      if (config.disclaimer_acknowledged) {
        setShowOnboarding(!config.onboarding_acknowledged);
        if (config.onboarding_acknowledged) {
          if (!config.github_login_acknowledged) {
            setShowGitHubLogin(true);
          } else if (!config.telemetry_acknowledged) {
            setShowPrivacyOptIn(true);
          } else if (config.show_release_notes) {
            setShowReleaseNotes(true);
          }
        }
      }
    }
  }, [config]);

  const handleDisclaimerAccept = async () => {
    if (!config) return;

    updateConfig({ disclaimer_acknowledged: true });

    try {
      await configApi.saveConfig({ ...config, disclaimer_acknowledged: true });
      setShowDisclaimer(false);
      setShowOnboarding(!config.onboarding_acknowledged);
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
      setShowOnboarding(false);
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
      setShowPrivacyOptIn(false);
      if (updatedConfig.show_release_notes) {
        setShowReleaseNotes(true);
      }
    } catch (err) {
      console.error('Error saving config:', err);
    }
  };

  const handleGitHubLoginComplete = async () => {
    try {
      // Refresh the config to get the latest GitHub authentication state
      const latestUserSystem = await configApi.getConfig();
      updateConfig(latestUserSystem.config);
      setShowGitHubLogin(false);

      // If user skipped (no GitHub token), we need to manually set the acknowledgment

      const updatedConfig = {
        ...latestUserSystem.config,
        github_login_acknowledged: true,
      };
      updateConfig(updatedConfig);
      await configApi.saveConfig(updatedConfig);
    } catch (err) {
      console.error('Error refreshing config:', err);
    } finally {
      if (!config?.telemetry_acknowledged) {
        setShowPrivacyOptIn(true);
      } else if (config?.show_release_notes) {
        setShowReleaseNotes(true);
      }
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
      setShowReleaseNotes(false);
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
            <GitHubLoginDialog
              open={showGitHubLogin}
              onOpenChange={handleGitHubLoginComplete}
            />
            <DisclaimerDialog
              open={showDisclaimer}
              onAccept={handleDisclaimerAccept}
            />
            <OnboardingDialog
              open={showOnboarding}
              onComplete={handleOnboardingComplete}
            />
            <PrivacyOptInDialog
              open={showPrivacyOptIn}
              onComplete={handlePrivacyOptInComplete}
            />
            <ReleaseNotesDialog
              open={showReleaseNotes}
              onClose={handleReleaseNotesClose}
            />
            <EditorSelectionDialog
              isOpen={editorDialogOpen}
              onClose={closeEditorDialog}
              selectedAttempt={selectedAttempt}
            />
            <CreatePRDialog />
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
          <EditorDialogProvider>
            <CreatePRDialogProvider>
              <TaskDialogProvider>
                <AppContent />
              </TaskDialogProvider>
            </CreatePRDialogProvider>
          </EditorDialogProvider>
        </ProjectProvider>
      </ConfigProvider>
    </BrowserRouter>
  );
}

export default App;
