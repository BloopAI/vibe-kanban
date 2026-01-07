import { browserTracingIntegration } from '@sentry/browser';
import { Integration } from '@sentry/core';
import * as React from 'react';
import { Action, AgnosticDataRouteMatch, CreateRouterFunction, CreateRoutesFromChildren, Location, MatchRoutes, RouteObject, Router, RouterState, UseEffect, UseLocation, UseNavigationType, UseRoutes } from './types';
export interface ReactRouterOptions {
    useEffect: UseEffect;
    useLocation: UseLocation;
    useNavigationType: UseNavigationType;
    createRoutesFromChildren: CreateRoutesFromChildren;
    matchRoutes: MatchRoutes;
    stripBasename?: boolean;
}
type V6CompatibleVersion = '6' | '7';
/**
 * Creates a wrapCreateBrowserRouter function that can be used with all React Router v6 compatible versions.
 */
export declare function createV6CompatibleWrapCreateBrowserRouter<TState extends RouterState = RouterState, TRouter extends Router<TState> = Router<TState>>(createRouterFunction: CreateRouterFunction<TState, TRouter>, version: V6CompatibleVersion): CreateRouterFunction<TState, TRouter>;
/**
 * Creates a wrapCreateMemoryRouter function that can be used with all React Router v6 compatible versions.
 */
export declare function createV6CompatibleWrapCreateMemoryRouter<TState extends RouterState = RouterState, TRouter extends Router<TState> = Router<TState>>(createRouterFunction: CreateRouterFunction<TState, TRouter>, version: V6CompatibleVersion): CreateRouterFunction<TState, TRouter>;
/**
 * Creates a browser tracing integration that can be used with all React Router v6 compatible versions.
 */
export declare function createReactRouterV6CompatibleTracingIntegration(options: Parameters<typeof browserTracingIntegration>[0] & ReactRouterOptions, version: V6CompatibleVersion): Integration;
export declare function createV6CompatibleWrapUseRoutes(origUseRoutes: UseRoutes, version: V6CompatibleVersion): UseRoutes;
export declare function handleNavigation(opts: {
    location: Location;
    routes: RouteObject[];
    navigationType: Action;
    version: V6CompatibleVersion;
    matches?: AgnosticDataRouteMatch;
    basename?: string;
    allRoutes?: RouteObject[];
}): void;
export declare function createV6CompatibleWithSentryReactRouterRouting<P extends Record<string, any>, R extends React.FC<P>>(Routes: R, version: V6CompatibleVersion): R;
/**
 * Returns number of URL segments of a passed string URL.
 */
export declare function getNumberOfUrlSegments(url: string): number;
export {};
//# sourceMappingURL=reactrouterv6-compat-utils.d.ts.map
