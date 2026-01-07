export interface VendoredTanstackRouter {
    history: VendoredTanstackRouterHistory;
    state: VendoredTanstackRouterState;
    options: {
        parseSearch: (search: string) => Record<string, any>;
    };
    matchRoutes: (pathname: string, locationSearch: {}, opts?: {
        preload?: boolean;
        throwOnError?: boolean;
    }) => Array<VendoredTanstackRouterRouteMatch>;
    subscribe(eventType: 'onResolved' | 'onBeforeNavigate', callback: (stateUpdate: {
        toLocation: VendoredTanstackRouterLocation;
        fromLocation?: VendoredTanstackRouterLocation;
    }) => void): () => void;
}
interface VendoredTanstackRouterLocation {
    pathname: string;
    search: {};
    state: string;
}
interface VendoredTanstackRouterHistory {
    subscribe: (cb: () => void) => () => void;
}
interface VendoredTanstackRouterState {
    matches: Array<VendoredTanstackRouterRouteMatch>;
    pendingMatches?: Array<VendoredTanstackRouterRouteMatch>;
}
export interface VendoredTanstackRouterRouteMatch {
    routeId: string;
    pathname: string;
    params: {
        [key: string]: string;
    };
}
export {};
//# sourceMappingURL=tanstackrouter-types.d.ts.map
