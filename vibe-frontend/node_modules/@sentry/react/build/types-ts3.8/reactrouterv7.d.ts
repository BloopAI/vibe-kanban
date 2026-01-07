/// <reference types="react" />
import { browserTracingIntegration } from '@sentry/browser';
import { Integration } from '@sentry/core';
import { ReactRouterOptions } from './reactrouterv6-compat-utils';
import { CreateRouterFunction, Router, RouterState, UseRoutes } from './types';
/**
 * A browser tracing integration that uses React Router v7 to instrument navigations.
 * Expects `useEffect`, `useLocation`, `useNavigationType`, `createRoutesFromChildren` and `matchRoutes` to be passed as options.
 */
export declare function reactRouterV7BrowserTracingIntegration(options: Parameters<typeof browserTracingIntegration>[0] & ReactRouterOptions): Integration;
/**
 * A higher-order component that adds Sentry routing instrumentation to a React Router v7 Route component.
 * This is used to automatically capture route changes as transactions.
 */
export declare function withSentryReactRouterV7Routing<P extends Record<string, any>, R extends React.FC<P>>(routes: R): R;
/**
 * A wrapper function that adds Sentry routing instrumentation to a React Router v7 createBrowserRouter function.
 * This is used to automatically capture route changes as transactions when using the createBrowserRouter API.
 */
export declare function wrapCreateBrowserRouterV7<TState extends RouterState = RouterState, TRouter extends Router<TState> = Router<TState>>(createRouterFunction: CreateRouterFunction<TState, TRouter>): CreateRouterFunction<TState, TRouter>;
/**
 * A wrapper function that adds Sentry routing instrumentation to a React Router v7 createMemoryRouter function.
 * This is used to automatically capture route changes as transactions when using the createMemoryRouter API.
 * The difference between createBrowserRouter and createMemoryRouter is that with createMemoryRouter,
 * optional `initialEntries` are also taken into account.
 */
export declare function wrapCreateMemoryRouterV7<TState extends RouterState = RouterState, TRouter extends Router<TState> = Router<TState>>(createMemoryRouterFunction: CreateRouterFunction<TState, TRouter>): CreateRouterFunction<TState, TRouter>;
/**
 * A wrapper function that adds Sentry routing instrumentation to a React Router v7 useRoutes hook.
 * This is used to automatically capture route changes as transactions when using the useRoutes hook.
 */
export declare function wrapUseRoutesV7(origUseRoutes: UseRoutes): UseRoutes;
//# sourceMappingURL=reactrouterv7.d.ts.map
