import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Navbar } from '@/components/layout/navbar';
import { Projects } from '@/pages/projects';
import { ProjectTasks } from '@/pages/project-tasks';
import { TaskDetailsPage } from '@/pages/task-details';

import { Settings } from '@/pages/Settings';
import { McpServers } from '@/pages/McpServers';
import { DisclaimerDialog } from '@/components/DisclaimerDialog';
import { OnboardingDialog } from '@/components/OnboardingDialog';
import { PrivacyOptInDialog } from '@/components/PrivacyOptInDialog';
import { ConfigProvider, useConfig } from '@/components/config-provider';
import { ThemeProvider } from '@/components/theme-provider';
import type { EditorType, ProfileVariantLabel } from 'shared/types';

import { configApi } from '@/lib/api';
import * as Sentry from '@sentry/react';
import { Loader } from '@/components/ui/loader';
import { GitHubLoginDialog } from '@/components/GitHubLoginDialog';
import { AppWithStyleOverride } from '@/utils/style-override';
import { WebviewContextMenu } from '@/vscode/ContextMenu';

const SentryRoutes = Sentry.withSentryReactRouterV6Routing(Routes);

function AppContent() {
  const { config, updateConfig, loading } = useConfig();
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showPrivacyOptIn, setShowPrivacyOptIn] = useState(false);
  const [showGitHubLogin, setShowGitHubLogin] = useState(false);

  useEffect(() => {
    if (!loading && config) {
      setShowDisclaimer(!config.disclaimer_acknowledged);
      setShowOnboarding(
        config.disclaimer_acknowledged && !config.onboarding_acknowledged
      );
      setShowPrivacyOptIn(
        config.disclaimer_acknowledged &&
          config.onboarding_acknowledged &&
          !config.telemetry_acknowledged
      );
      setShowGitHubLogin(
        config.disclaimer_acknowledged &&
          config.onboarding_acknowledged &&
          config.telemetry_acknowledged &&
          !config.github_login_acknowledged
      );
    }
  }, [config, loading]);

  const handleDisclaimerAccept = async () => {
    if (!config) return;
    try {
      await configApi.saveConfig({
        ...config,
        disclaimer_acknowledged: true,
      });
      setShowDisclaimer(false);
    } catch (err) {
      console.error('Error saving config:', err);
    }
  };

  const handleOnboardingComplete = async (onboardingConfig: {
    profile: ProfileVariantLabel;
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader message="Loading configuration..." size={48} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
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

      <GitHubLoginDialog
        open={showGitHubLogin}
        onOpenChange={(open) => setShowGitHubLogin(open)}
      />

      <Navbar />
      <main className="flex-1">
        <SentryRoutes>
          <Route path="/" element={<Projects />} />
          <Route path="/projects/:projectId" element={<ProjectTasks />} />
          <Route
            path="/projects/:projectId/tasks/:taskId"
            element={<TaskDetailsPage />}
          />
          <Route path="/settings" element={<Settings />} />
          <Route path="/mcp-servers" element={<McpServers />} />
        </SentryRoutes>
      </main>
    </div>
  );
}

function InnerApp() {
  return (
    <AppWithStyleOverride>
      <AppContent />
      <WebviewContextMenu />
    </AppWithStyleOverride>
  );
}

export default function App() {
  return (
    <ConfigProvider>
      <ThemeProvider>
        <BrowserRouter>
          <InnerApp />
        </BrowserRouter>
      </ThemeProvider>
    </ConfigProvider>
  );
}
