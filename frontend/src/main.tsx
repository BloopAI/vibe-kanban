import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ClickToComponent } from 'click-to-react-component';
import * as Sentry from '@sentry/react';
import { useLocation, useNavigationType, createRoutesFromChildren, matchRoutes } from 'react-router-dom';

Sentry.init({
  dsn: 'https://57267b883c0c76a9b636f3f227809417@o4509603705192449.ingest.de.sentry.io/4509603708207184',
  tracesSampleRate: 1.0,
  environment: import.meta.env.MODE === 'development' ? 'dev' : 'prod',
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<p>An error has occurred</p>} showDialog>
      <ClickToComponent />
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);
