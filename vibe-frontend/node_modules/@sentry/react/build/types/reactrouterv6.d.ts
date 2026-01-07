/// <reference types="react" />
import type { browserTracingIntegration } from '@sentry/browser';
import type { Integration } from '@sentry/core';
import type { ReactRouterOptions } from './reactrouterv6-compat-utils';
import type { CreateRouterFunction, Router, RouterState, UseRoutes } from './types';
/**
 * A browser tracing integration that uses React Router v6 to instrument navigations.
 * Expects `useEffect`, `useLocation`, `useNavigationType`, `createRoutesFromChildren` and `matchRoutes` to be passed as options.
 */
export declare function reactRouterV6BrowserTracingIntegration(options: Parameters<typeof browserTracingIntegration>[0] & ReactRouterOptions): Integration;
/**
 * A wrapper function that adds Sentry routing instrumentation to a React Router v6 useRoutes hook.
 * This is used to automatically capture route changes as transactions when using the useRoutes hook.
 */
export declare function wrapUseRoutesV6(origUseRoutes: UseRoutes): UseRoutes;
/**
 * A wrapper function that adds Sentry routing instrumentation to a React Router v6 createBrowserRouter function.
 * This is used to automatically capture route changes as transactions when using the createBrowserRouter API.
 */
export declare function wrapCreateBrowserRouterV6<TState extends RouterState = RouterState, TRouter extends Router<TState> = Router<TState>>(createRouterFunction: CreateRouterFunction<TState, TRouter>): CreateRouterFunction<TState, TRouter>;
/**
 * A wrapper function that adds Sentry routing instrumentation to a React Router v6 createMemoryRouter function.
 * This is used to automatically capture route changes as transactions when using the createMemoryRouter API.
 * The difference between createBrowserRouter and createMemoryRouter is that with createMemoryRouter,
 * optional `initialEntries` are also taken into account.
 */
export declare function wrapCreateMemoryRouterV6<TState extends RouterState = RouterState, TRouter extends Router<TState> = Router<TState>>(createMemoryRouterFunction: CreateRouterFunction<TState, TRouter>): CreateRouterFunction<TState, TRouter>;
/**
 * A higher-order component that adds Sentry routing instrumentation to a React Router v6 Route component.
 * This is used to automatically capture route changes as transactions.
 */
export declare function withSentryReactRouterV6Routing<P extends Record<string, any>, R extends React.FC<P>>(routes: R): R;
//# sourceMappingURL=reactrouterv6.d.ts.map