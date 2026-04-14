import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import i18n from '@/i18n';
import { Projects } from '@/pages/Projects';
import { ProjectTasks } from '@/pages/ProjectTasks';
import { AllProjectsTasks } from '@/pages/AllProjectsTasks';
import { FullAttemptLogsPage } from '@/pages/FullAttemptLogs';
import { Nodes } from '@/pages/Nodes';
import { Processes } from '@/pages/Processes';
import { NormalLayout } from '@/components/layout/NormalLayout';
import { useAuth } from '@/hooks';

// Keep SettingsLayout as static import (small, needed for route structure)
import { SettingsLayout } from '@/pages/settings/';

// Lazy load settings pages for code splitting
const GeneralSettings = lazy(() =>
  import('@/pages/settings/GeneralSettings').then((m) => ({
    default: m.GeneralSettings,
  }))
);
const ProjectSettings = lazy(() =>
  import('@/pages/settings/ProjectSettings').then((m) => ({
    default: m.ProjectSettings,
  }))
);
const OrganizationSettings = lazy(() =>
  import('@/pages/settings/OrganizationSettings').then((m) => ({
    default: m.OrganizationSettings,
  }))
);
const SwarmSettings = lazy(() =>
  import('@/pages/settings/SwarmSettings').then((m) => ({
    default: m.SwarmSettings,
  }))
);
const AgentSettings = lazy(() =>
  import('@/pages/settings/AgentSettings').then((m) => ({
    default: m.AgentSettings,
  }))
);
const McpSettings = lazy(() =>
  import('@/pages/settings/McpSettings').then((m) => ({
    default: m.McpSettings,
  }))
);
const WebhooksSettings = lazy(() =>
  import('@/pages/settings/WebhooksSettings').then((m) => ({
    default: m.WebhooksSettings,
  }))
);
const SystemSettings = lazy(() =>
  import('@/pages/settings/SystemSettings').then((m) => ({
    default: m.SystemSettings,
  }))
);
import { UserSystemProvider, useUserSystem } from '@/components/ConfigProvider';
import { ThemeProvider } from '@/components/ThemeProvider';
import { FontProvider } from '@/components/FontProvider';
import { SearchProvider } from '@/contexts/SearchContext';

import { HotkeysProvider } from 'react-hotkeys-hook';

import { ProjectProvider } from '@/contexts/ProjectContext';
import { FileViewerProvider } from '@/contexts/FileViewerContext';
import { FileViewerContainer } from '@/components/files';
import { ThemeMode } from 'shared/types';

import { DisclaimerDialog } from '@/components/dialogs/global/DisclaimerDialog';
import { OnboardingDialog } from '@/components/dialogs/global/OnboardingDialog';
import { ReleaseNotesDialog } from '@/components/dialogs/global/ReleaseNotesDialog';
import { ClickedElementsProvider } from './contexts/ClickedElementsProvider';
import NiceModal from '@ebay/nice-modal-react';

function SettingsLoadingFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function AppContent() {
  const { config, updateAndSaveConfig } = useUserSystem();
  const { isSignedIn } = useAuth();

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

  return (
    <I18nextProvider i18n={i18n}>
      <ThemeProvider initialTheme={config?.theme || ThemeMode.SYSTEM}>
        <FontProvider initialFonts={config?.fonts}>
          <SearchProvider>
            <div className="h-screen flex flex-row bg-background">
              {/* Main content area - takes remaining space */}
              <div className="flex-1 min-w-0 flex flex-col">
                <Routes>
                  {/* VS Code full-page logs route (outside NormalLayout for minimal UI) */}
                  <Route
                    path="/projects/:projectId/tasks/:taskId/attempts/:attemptId/full"
                    element={<FullAttemptLogsPage />}
                  />

                  <Route element={<NormalLayout />}>
                    <Route path="/" element={<Projects />} />
                    <Route path="/projects" element={<Projects />} />
                    <Route path="/projects/:projectId" element={<Projects />} />
                    <Route path="/nodes" element={<Nodes />} />
                    <Route path="/nodes/:nodeId" element={<Nodes />} />
                    <Route path="/processes" element={<Processes />} />
                    <Route path="/tasks/all" element={<AllProjectsTasks />} />
                    <Route
                      path="/projects/:projectId/tasks"
                      element={<ProjectTasks />}
                    />
                    <Route path="/settings/*" element={<SettingsLayout />}>
                      <Route
                        index
                        element={<Navigate to="general" replace />}
                      />
                      <Route
                        path="general"
                        element={
                          <Suspense fallback={<SettingsLoadingFallback />}>
                            <GeneralSettings />
                          </Suspense>
                        }
                      />
                      <Route
                        path="projects"
                        element={
                          <Suspense fallback={<SettingsLoadingFallback />}>
                            <ProjectSettings />
                          </Suspense>
                        }
                      />
                      <Route
                        path="organizations"
                        element={
                          <Suspense fallback={<SettingsLoadingFallback />}>
                            <OrganizationSettings />
                          </Suspense>
                        }
                      />
                      <Route
                        path="swarm"
                        element={
                          <Suspense fallback={<SettingsLoadingFallback />}>
                            <SwarmSettings />
                          </Suspense>
                        }
                      />
                      <Route
                        path="agents"
                        element={
                          <Suspense fallback={<SettingsLoadingFallback />}>
                            <AgentSettings />
                          </Suspense>
                        }
                      />
                      <Route
                        path="mcp"
                        element={
                          <Suspense fallback={<SettingsLoadingFallback />}>
                            <McpSettings />
                          </Suspense>
                        }
                      />
                      <Route
                        path="webhooks"
                        element={
                          <Suspense fallback={<SettingsLoadingFallback />}>
                            <WebhooksSettings />
                          </Suspense>
                        }
                      />
                      <Route
                        path="system"
                        element={
                          <Suspense fallback={<SettingsLoadingFallback />}>
                            <SystemSettings />
                          </Suspense>
                        }
                      />
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
                </Routes>
              </div>
              {/* File viewer side panel - renders alongside content on desktop */}
              <FileViewerContainer />
            </div>
          </SearchProvider>
        </FontProvider>
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
            <FileViewerProvider>
              <HotkeysProvider
                initiallyActiveScopes={['*', 'global', 'kanban']}
              >
                <NiceModal.Provider>
                  <AppContent />
                </NiceModal.Provider>
              </HotkeysProvider>
            </FileViewerProvider>
          </ProjectProvider>
        </ClickedElementsProvider>
      </UserSystemProvider>
    </BrowserRouter>
  );
}

export default App;
