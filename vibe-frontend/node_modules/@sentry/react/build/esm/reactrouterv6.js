import { createReactRouterV6CompatibleTracingIntegration, createV6CompatibleWithSentryReactRouterRouting, createV6CompatibleWrapUseRoutes, createV6CompatibleWrapCreateBrowserRouter, createV6CompatibleWrapCreateMemoryRouter } from './reactrouterv6-compat-utils.js';

/**
 * A browser tracing integration that uses React Router v6 to instrument navigations.
 * Expects `useEffect`, `useLocation`, `useNavigationType`, `createRoutesFromChildren` and `matchRoutes` to be passed as options.
 */
function reactRouterV6BrowserTracingIntegration(
  options,
) {
  return createReactRouterV6CompatibleTracingIntegration(options, '6');
}

/**
 * A wrapper function that adds Sentry routing instrumentation to a React Router v6 useRoutes hook.
 * This is used to automatically capture route changes as transactions when using the useRoutes hook.
 */
function wrapUseRoutesV6(origUseRoutes) {
  return createV6CompatibleWrapUseRoutes(origUseRoutes, '6');
}

/**
 * A wrapper function that adds Sentry routing instrumentation to a React Router v6 createBrowserRouter function.
 * This is used to automatically capture route changes as transactions when using the createBrowserRouter API.
 */
function wrapCreateBrowserRouterV6

(createRouterFunction) {
  return createV6CompatibleWrapCreateBrowserRouter(createRouterFunction, '6');
}

/**
 * A wrapper function that adds Sentry routing instrumentation to a React Router v6 createMemoryRouter function.
 * This is used to automatically capture route changes as transactions when using the createMemoryRouter API.
 * The difference between createBrowserRouter and createMemoryRouter is that with createMemoryRouter,
 * optional `initialEntries` are also taken into account.
 */
function wrapCreateMemoryRouterV6

(createMemoryRouterFunction) {
  return createV6CompatibleWrapCreateMemoryRouter(createMemoryRouterFunction, '6');
}

/**
 * A higher-order component that adds Sentry routing instrumentation to a React Router v6 Route component.
 * This is used to automatically capture route changes as transactions.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withSentryReactRouterV6Routing(routes) {
  return createV6CompatibleWithSentryReactRouterRouting(routes, '6');
}

export { reactRouterV6BrowserTracingIntegration, withSentryReactRouterV6Routing, wrapCreateBrowserRouterV6, wrapCreateMemoryRouterV6, wrapUseRoutesV6 };
//# sourceMappingURL=reactrouterv6.js.map
