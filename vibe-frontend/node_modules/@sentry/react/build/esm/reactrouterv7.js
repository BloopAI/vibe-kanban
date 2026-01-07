import { createReactRouterV6CompatibleTracingIntegration, createV6CompatibleWithSentryReactRouterRouting, createV6CompatibleWrapCreateBrowserRouter, createV6CompatibleWrapCreateMemoryRouter, createV6CompatibleWrapUseRoutes } from './reactrouterv6-compat-utils.js';

/**
 * A browser tracing integration that uses React Router v7 to instrument navigations.
 * Expects `useEffect`, `useLocation`, `useNavigationType`, `createRoutesFromChildren` and `matchRoutes` to be passed as options.
 */
function reactRouterV7BrowserTracingIntegration(
  options,
) {
  return createReactRouterV6CompatibleTracingIntegration(options, '7');
}

/**
 * A higher-order component that adds Sentry routing instrumentation to a React Router v7 Route component.
 * This is used to automatically capture route changes as transactions.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withSentryReactRouterV7Routing(routes) {
  return createV6CompatibleWithSentryReactRouterRouting(routes, '7');
}

/**
 * A wrapper function that adds Sentry routing instrumentation to a React Router v7 createBrowserRouter function.
 * This is used to automatically capture route changes as transactions when using the createBrowserRouter API.
 */
function wrapCreateBrowserRouterV7

(createRouterFunction) {
  return createV6CompatibleWrapCreateBrowserRouter(createRouterFunction, '7');
}

/**
 * A wrapper function that adds Sentry routing instrumentation to a React Router v7 createMemoryRouter function.
 * This is used to automatically capture route changes as transactions when using the createMemoryRouter API.
 * The difference between createBrowserRouter and createMemoryRouter is that with createMemoryRouter,
 * optional `initialEntries` are also taken into account.
 */
function wrapCreateMemoryRouterV7

(createMemoryRouterFunction) {
  return createV6CompatibleWrapCreateMemoryRouter(createMemoryRouterFunction, '7');
}

/**
 * A wrapper function that adds Sentry routing instrumentation to a React Router v7 useRoutes hook.
 * This is used to automatically capture route changes as transactions when using the useRoutes hook.
 */
function wrapUseRoutesV7(origUseRoutes) {
  return createV6CompatibleWrapUseRoutes(origUseRoutes, '7');
}

export { reactRouterV7BrowserTracingIntegration, withSentryReactRouterV7Routing, wrapCreateBrowserRouterV7, wrapCreateMemoryRouterV7, wrapUseRoutesV7 };
//# sourceMappingURL=reactrouterv7.js.map
