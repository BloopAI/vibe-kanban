import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Navbar } from '@/components/layout/navbar';
import { Projects } from '@/pages/projects';
import { ProjectTasks } from '@/pages/project-tasks';

import { Settings } from '@/pages/Settings';
import { McpServers } from '@/pages/McpServers';
import { DisclaimerDialog } from '@/components/DisclaimerDialog';
import { OnboardingDialog } from '@/components/OnboardingDialog';
import { ConfigProvider, useConfig } from '@/components/config-provider';
import { AuthProvider } from '@/components/auth-provider';
import { ThemeProvider } from '@/components/theme-provider';
import type { EditorType, ExecutorConfig } from 'shared/types';
import { configApi } from '@/lib/api';
import * as Sentry from '@sentry/react';
import { Loader } from '@/components/ui/loader';
import { Button } from '@/components/ui/button';
import { MultiuserGitHubLoginDialog } from '@/components/MultiuserGitHubLoginDialog';
import { useAuth } from '@/components/auth-provider';
import { Github } from 'lucide-react';

const SentryRoutes = Sentry.withSentryReactRouterV6Routing(Routes);

function AppContent() {
  const { config, updateConfig, loading } = useConfig();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showGitHubLogin, setShowGitHubLogin] = useState(false);
  const showNavbar = true;

  useEffect(() => {
    if (config) {
      setShowDisclaimer(!config.disclaimer_acknowledged);
      if (config.disclaimer_acknowledged) {
        setShowOnboarding(!config.onboarding_acknowledged);
        if (config.onboarding_acknowledged && !isAuthenticated) {
          setShowGitHubLogin(true);
        }
      }
    }
  }, [config, isAuthenticated]);

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
    executor: ExecutorConfig;
    editor: { editor_type: EditorType; custom_command: string | null };
  }) => {
    if (!config) return;

    const updatedConfig = {
      ...config,
      onboarding_acknowledged: true,
      executor: onboardingConfig.executor,
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

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader message={loading ? "Loading..." : "Checking authentication..."} size={32} />
      </div>
    );
  }

  return (
    <ThemeProvider initialTheme={config?.theme || 'system'}>
      <div className="h-screen flex flex-col bg-background">
        <MultiuserGitHubLoginDialog
          open={showGitHubLogin}
          onOpenChange={(open) => {
            // Allow closing the dialog if user is authenticated or still in onboarding
            if (isAuthenticated || showDisclaimer || showOnboarding) {
              setShowGitHubLogin(open);
            }
            // If not authenticated and past onboarding, keep dialog open (required login)
          }}
        />
        <DisclaimerDialog
          open={showDisclaimer}
          onAccept={handleDisclaimerAccept}
        />
        <OnboardingDialog
          open={showOnboarding}
          onComplete={handleOnboardingComplete}
        />
        {/* Only show main app content when authenticated */}
        {isAuthenticated && (
          <>
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
                  path="/projects/:projectId/tasks/:taskId"
                  element={<ProjectTasks />}
                />

                <Route path="/settings" element={<Settings />} />
                <Route path="/mcp-servers" element={<McpServers />} />
              </SentryRoutes>
            </div>
          </>
        )}
        
        {/* Show authentication required message when not authenticated */}
        {!isAuthenticated && !showDisclaimer && !showOnboarding && !showGitHubLogin && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-2">Authentication Required</h2>
              <p className="text-gray-600 mb-4">Please sign in with GitHub to access the application.</p>
              <Button onClick={() => setShowGitHubLogin(true)}>
                <Github className="h-4 w-4 mr-2" />
                Sign in with GitHub
              </Button>
            </div>
          </div>
        )}
      </div>
    </ThemeProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ConfigProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ConfigProvider>
    </BrowserRouter>
  );
}

export default App;