import { browserTracingIntegration as originalBrowserTracingIntegration } from '@sentry/browser';
import type { Integration } from '@sentry/core';
/**
 * A custom browser tracing integration for TanStack Router.
 *
 * The minimum compatible version of `@tanstack/react-router` is `1.64.0`.
 *
 * @param router A TanStack Router `Router` instance that should be used for routing instrumentation.
 * @param options Sentry browser tracing configuration.
 */
export declare function tanstackRouterBrowserTracingIntegration(router: any, // This is `any` because we don't want any type mismatches if TanStack Router changes their types
options?: Parameters<typeof originalBrowserTracingIntegration>[0]): Integration;
//# sourceMappingURL=tanstackrouter.d.ts.map