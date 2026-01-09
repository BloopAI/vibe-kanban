import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './styles/index.css';
import { ClickToComponent } from 'click-to-react-component';
import { VibeKanbanWebCompanion } from 'vibe-kanban-web-companion';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import * as Sentry from '@sentry/react';
import i18n from './i18n';
import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
import { ClerkProvider } from '@clerk/clerk-react';
import { AuthInitializer } from '@/components/auth/AuthInitializer';
import { createIndexedDBPersister } from '@/lib/indexedDBPersister';
import { ConnectionProvider } from '@/contexts/ConnectionContext';
import { SyncQueueProvider } from '@/contexts/SyncQueueContext';
// Import modal type definitions
import './types/modals';

// Clerk publishable key from environment
const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!CLERK_PUBLISHABLE_KEY) {
  console.warn(
    'Clerk publishable key not set. Authentication will be disabled. ' +
    'To enable, copy frontend/.env.local.example to frontend/.env.local and add your key.'
  );
}

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
      staleTime: 1000 * 60 * 30, // 30 minutes (increased for better offline support)
      gcTime: 1000 * 60 * 60, // 1 hour (was cacheTime, for persistence)
      refetchOnWindowFocus: false,
      retry: 2, // Retry failed requests twice
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff, max 30s
    },
  },
});

// Create IndexedDB persister for offline cache survival
const persister = createIndexedDBPersister();

// Persistence configuration
const persistOptions = {
  persister,
  maxAge: 1000 * 60 * 60 * 24, // 24 hours
  buster: 'v1', // Change this to invalidate all caches
};

// Render app with optional ClerkProvider wrapper
const AppWithProviders = () => (
  <React.StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
    >
      <ConnectionProvider>
        <SyncQueueProvider>
          <PostHogProvider client={posthog}>
            <Sentry.ErrorBoundary
              fallback={<p>{i18n.t('common:states.error')}</p>}
              showDialog
            >
              <ClickToComponent />
              <VibeKanbanWebCompanion />
              <App />
              {/*<TanStackDevtools plugins={[FormDevtoolsPlugin()]} />*/}
              {/* <ReactQueryDevtools initialIsOpen={false} /> */}
            </Sentry.ErrorBoundary>
          </PostHogProvider>
        </SyncQueueProvider>
      </ConnectionProvider>
    </PersistQueryClientProvider>
  </React.StrictMode>
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  CLERK_PUBLISHABLE_KEY ? (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} afterSignOutUrl="/">
      <AuthInitializer />
      <AppWithProviders />
    </ClerkProvider>
  ) : (
    <AppWithProviders />
  )
);
