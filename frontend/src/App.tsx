import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Navbar } from '@/components/layout/navbar';
import { Projects } from '@/pages/projects';
import { ProjectTasks } from '@/pages/project-tasks';

import { Settings } from '@/pages/Settings';
import { McpServers } from '@/pages/McpServers';
import { DisclaimerDialog } from '@/components/DisclaimerDialog';
import { OnboardingDialog } from '@/components/OnboardingDialog';
import { PrivacyOptInDialog } from '@/components/PrivacyOptInDialog';
import { ConfigProvider, useConfig } from '@/components/config-provider';
import { ThemeProvider } from '@/components/theme-provider';
import type { EditorType } from 'shared/types';
import { ThemeMode } from 'shared/types';
import { configApi } from '@/lib/api';
import * as Sentry from '@sentry/react';
import { Loader } from '@/components/ui/loader';
import { GitHubLoginDialog } from '@/components/GitHubLoginDialog';

const SentryRoutes = Sentry.withSentryReactRouterV6Routing(Routes);

function AppContent() {
  const { config, updateConfig, loading } = useConfig();
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showPrivacyOptIn, setShowPrivacyOptIn] = useState(false);
  const [showGitHubLogin, setShowGitHubLogin] = useState(false);
  const showNavbar = true;

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
    profile: string;
    editor: { editor_type: EditorType; custom_command: string | null };
  }) => {
    if (!config) return;

    const updatedConfig = {
      ...config,
      onboarding_acknowledged: true,
      profile: onboardingConfig.profile,
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
      }
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
      <div className="h-screen flex flex-col bg-background">
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
        {showNavbar && <Navbar />}
        <div className="flex-1 overflow-y-scroll">
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
              path="/projects/:projectId/tasks/:taskId"
              element={<ProjectTasks />}
            />

            <Route path="/settings" element={<Settings />} />
            <Route path="/mcp-servers" element={<McpServers />} />
          </SentryRoutes>
        </div>
      </div>
    </ThemeProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ConfigProvider>
        <AppContent />
      </ConfigProvider>
    </BrowserRouter>
  );
}

export default App;
