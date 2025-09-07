import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './styles/index.css';
import { ClickToComponent } from 'click-to-react-component';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Sentry from '@sentry/react';
import NiceModal from '@ebay/nice-modal-react';
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
  RebaseDialog,
  CreateConfigurationDialog,
  DeleteConfigurationDialog,
  ProjectFormDialog,
  ProjectEditorSelectionDialog,
  RestoreLogsDialog,
} from './components/dialogs';

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
NiceModal.register('rebase-dialog', RebaseDialog);
NiceModal.register('create-configuration', CreateConfigurationDialog);
NiceModal.register('delete-configuration', DeleteConfigurationDialog);
NiceModal.register('project-form', ProjectFormDialog);
NiceModal.register('project-editor-selection', ProjectEditorSelectionDialog);
NiceModal.register('restore-logs', RestoreLogsDialog);
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
      <Sentry.ErrorBoundary fallback={<p>An error has occurred</p>} showDialog>
        <ClickToComponent />
        <App />
        {/* <ReactQueryDevtools initialIsOpen={false} /> */}
      </Sentry.ErrorBoundary>
    </QueryClientProvider>
  </React.StrictMode>
);
