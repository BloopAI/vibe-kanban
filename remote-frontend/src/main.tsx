import React from "react";
import ReactDOM from "react-dom/client";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import * as Sentry from "@sentry/react";
import AppRouter from "./AppRouter.tsx";
import "./index.css";

Sentry.init({
  dsn: "https://1065a1d276a581316999a07d5dffee26@o4509603705192449.ingest.de.sentry.io/4509605576441937",
  tracesSampleRate: 1.0,
  environment: import.meta.env.MODE === "development" ? "dev" : "production",
});

Sentry.setTag("source", "remote-frontend");

if (import.meta.env.VITE_PUBLIC_POSTHOG_KEY) {
  posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, {
    api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PostHogProvider client={posthog}>
      <AppRouter />
    </PostHogProvider>
  </React.StrictMode>,
);
