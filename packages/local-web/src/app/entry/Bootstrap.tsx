import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { ClickToComponent } from 'click-to-react-component';
import { QueryClientProvider } from '@tanstack/react-query';
import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
import App from '@web/app/entry/App';
import { CrashScreen } from '@vibe/ui/components/CrashScreen';
import '@/i18n';
import { oauthApi } from '@/shared/lib/api';
import { tokenManager } from '@/shared/lib/auth/tokenManager';
import { configureAuthRuntime } from '@/shared/lib/auth/runtime';
import '@/shared/types/modals';
import { queryClient } from '@/shared/lib/queryClient';
import { isTauriApp } from '@/shared/lib/platform';
import { initZoom, zoomIn, zoomOut, zoomReset } from '@/shared/lib/zoom';

// Usage analytics (PostHog) and crash reports (Sentry) are turned off: this
// version of Vibe Kanban never initializes either client, so nothing is sent.

// In the Tauri desktop app, implement custom zoom (Cmd/Ctrl + =/–/0) via root
// font-size scaling and block trackpad/touchpad pinch-to-zoom.
if (isTauriApp()) {
  initZoom();

  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;

    if (e.key === '=' || e.key === '+') {
      e.preventDefault();
      zoomIn();
    } else if (e.key === '-') {
      e.preventDefault();
      zoomOut();
    } else if (e.key === '0') {
      e.preventDefault();
      zoomReset();
    }
  });

  document.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey) e.preventDefault();
    },
    { passive: false }
  );
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('gesturechange', (e) => e.preventDefault());
}

configureAuthRuntime({
  getToken: () => tokenManager.getToken(),
  triggerRefresh: () => tokenManager.triggerRefresh(),
  registerShape: (shape) => tokenManager.registerShape(shape),
  getCurrentUser: () => oauthApi.getCurrentUser(),
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <PostHogProvider client={posthog}>
        <Sentry.ErrorBoundary
          fallback={({ error, componentStack }) => (
            <CrashScreen
              error={error instanceof Error ? error : undefined}
              componentStack={componentStack}
            />
          )}
          showDialog
        >
          <ClickToComponent />
          <App />
        </Sentry.ErrorBoundary>
      </PostHogProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
