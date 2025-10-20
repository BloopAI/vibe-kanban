import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './styles/index.css';
import { ClickToComponent } from 'click-to-react-component';
import { VibeKanbanWebCompanion } from 'vibe-kanban-web-companion';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Sentry from '@sentry/react';
import NiceModal from '@ebay/nice-modal-react';
import i18n from './i18n';
import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
// Import modal type definitions
import './types/modals';
// Import and register modals
import {
  GitHubLoginDialog,
  CreatePRDialog,
  ConfirmDialog,
  DisclaimerDialog,
  OnboardingDialog,
  PrivacyOptInDialog,
  ProvidePatDialog,
  ReleaseNotesDialog,
  TaskFormDialog,
  EditorSelectionDialog,
  DeleteTaskConfirmationDialog,
  FolderPickerDialog,
  TaskTemplateEditDialog,
  ChangeTargetBranchDialog,
  RebaseDialog,
  CreateConfigurationDialog,
  DeleteConfigurationDialog,
  ProjectFormDialog,
  ProjectEditorSelectionDialog,
  RestoreLogsDialog,
  ViewProcessesDialog,
} from './components/dialogs';
import { CreateAttemptDialog } from './components/dialogs/tasks/CreateAttemptDialog';

// Register modals
NiceModal.register('github-login', GitHubLoginDialog);
NiceModal.register('create-pr', CreatePRDialog);
NiceModal.register('confirm', ConfirmDialog);
NiceModal.register('disclaimer', DisclaimerDialog);
NiceModal.register('onboarding', OnboardingDialog);
NiceModal.register('privacy-opt-in', PrivacyOptInDialog);
NiceModal.register('provide-pat', ProvidePatDialog);
NiceModal.register('release-notes', ReleaseNotesDialog);
NiceModal.register('delete-task-confirmation', DeleteTaskConfirmationDialog);
NiceModal.register('task-form', TaskFormDialog);
NiceModal.register('editor-selection', EditorSelectionDialog);
NiceModal.register('folder-picker', FolderPickerDialog);
NiceModal.register('task-template-edit', TaskTemplateEditDialog);
NiceModal.register('change-target-branch-dialog', ChangeTargetBranchDialog);
NiceModal.register('rebase-dialog', RebaseDialog);
NiceModal.register('create-configuration', CreateConfigurationDialog);
NiceModal.register('delete-configuration', DeleteConfigurationDialog);
NiceModal.register('project-form', ProjectFormDialog);
NiceModal.register('project-editor-selection', ProjectEditorSelectionDialog);
NiceModal.register('restore-logs', RestoreLogsDialog);
NiceModal.register('view-processes', ViewProcessesDialog);
NiceModal.register('create-attempt', CreateAttemptDialog);
// Install VS Code iframe keyboard bridge when running inside an iframe
import './vscode/bridge';

import {
  useLocation,
  useNavigationType,
  createRoutesFromChildren,
  matchRoutes,
} from 'react-router-dom';

Sentry.init({
  dsn: 'https://1065a1d276a581316999a07d5dffee26@o4509603705192449.ingest.de.sentry.io/4509605576441937',
  tracesSampleRate: 1.0,
  environment: import.meta.env.MODE === 'development' ? 'dev' : 'production',
  integrations: [
    Sentry.reactRouterV6BrowserTracingIntegration({
      useEffect: React.useEffect,
      useLocation,
      useNavigationType,
      createRoutesFromChildren,
      matchRoutes,
    }),
  ],
});
Sentry.setTag('source', 'frontend');

if (
  import.meta.env.VITE_POSTHOG_API_KEY &&
  import.meta.env.VITE_POSTHOG_API_ENDPOINT
) {
  posthog.init(import.meta.env.VITE_POSTHOG_API_KEY, {
    api_host: import.meta.env.VITE_POSTHOG_API_ENDPOINT,
    capture_pageview: false,
    capture_pageleave: true,
    capture_performance: true,
    autocapture: false,
    opt_out_capturing_by_default: true,
  });
} else {
  console.warn(
    'PostHog API key or endpoint not set. Analytics will be disabled.'
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <PostHogProvider client={posthog}>
        <Sentry.ErrorBoundary
          fallback={<p>{i18n.t('common:states.error')}</p>}
          showDialog
        >
          <ClickToComponent />
          <VibeKanbanWebCompanion />
          <App />
          {/* <ReactQueryDevtools initialIsOpen={false} /> */}
        </Sentry.ErrorBoundary>
      </PostHogProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
