import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Navbar } from '@/components/layout/navbar';
import { Projects } from '@/pages/projects';
import { ProjectTasks } from '@/pages/project-tasks';
import { TaskAttemptComparePage } from '@/pages/task-attempt-compare';
import { Settings } from '@/pages/Settings';
import { DisclaimerDialog } from '@/components/DisclaimerDialog';
import { OnboardingDialog } from '@/components/OnboardingDialog';
import { ConfigProvider, useConfig } from '@/components/config-provider';
import { ThemeProvider } from '@/components/theme-provider';
import type {
  Config,
  ApiResponse,
  ExecutorConfig,
  EditorType,
} from 'shared/types';

function AppContent() {
  const { config, updateConfig, loading } = useConfig();
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const showNavbar = true;

  useEffect(() => {
    if (config) {
      setShowDisclaimer(!config.disclaimer_acknowledged);
      if (config.disclaimer_acknowledged) {
        setShowOnboarding(!config.onboarding_acknowledged);
      }
    }
  }, [config]);

  const handleDisclaimerAccept = async () => {
    if (!config) return;

    updateConfig({ disclaimer_acknowledged: true });

    try {
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...config, disclaimer_acknowledged: true }),
      });

      const data: ApiResponse<Config> = await response.json();

      if (data.success) {
        setShowDisclaimer(false);
        setShowOnboarding(!config.onboarding_acknowledged);
      }
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
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedConfig),
      });

      const data: ApiResponse<Config> = await response.json();

      if (data.success) {
        setShowOnboarding(false);
      }
    } catch (err) {
      console.error('Error saving config:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <ThemeProvider initialTheme={config?.theme || 'system'}>
      <div className="h-screen flex flex-col bg-background">
        <DisclaimerDialog
          open={showDisclaimer}
          onAccept={handleDisclaimerAccept}
        />
        <OnboardingDialog
          open={showOnboarding}
          onComplete={handleOnboardingComplete}
        />
        {showNavbar && <Navbar />}
        <div className="flex-1 overflow-y-scroll">
          <Routes>
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
            <Route
              path="/projects/:projectId/tasks/:taskId/attempts/:attemptId/compare"
              element={<TaskAttemptComparePage />}
            />
            <Route path="/settings" element={<Settings />} />
          </Routes>
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
