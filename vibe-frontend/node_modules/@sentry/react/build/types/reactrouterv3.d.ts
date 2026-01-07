import { browserTracingIntegration } from '@sentry/browser';
import type { Integration } from '@sentry/core';
import type { Location } from './types';
type HistoryV3 = {
    location?: Location;
    listen?(cb: (location: Location) => void): void;
} & Record<string, any>;
export type Route = {
    path?: string;
    childRoutes?: Route[];
};
export type Match = (props: {
    location: Location;
    routes: Route[];
}, cb: (error?: Error, _redirectLocation?: Location, renderProps?: {
    routes?: Route[];
}) => void) => void;
interface ReactRouterOptions {
    history: HistoryV3;
    routes: Route[];
    match: Match;
}
/**
 * A browser tracing integration that uses React Router v3 to instrument navigations.
 * Expects `history` (and optionally `routes` and `matchPath`) to be passed as options.
 */
export declare function reactRouterV3BrowserTracingIntegration(options: Parameters<typeof browserTracingIntegration>[0] & ReactRouterOptions): Integration;
export {};
//# sourceMappingURL=reactrouterv3.d.ts.map