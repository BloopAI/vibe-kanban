Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const reactrouterv6CompatUtils = require('./reactrouterv6-compat-utils.js');

/**
 * A browser tracing integration that uses React Router v6 to instrument navigations.
 * Expects `useEffect`, `useLocation`, `useNavigationType`, `createRoutesFromChildren` and `matchRoutes` to be passed as options.
 */
function reactRouterV6BrowserTracingIntegration(
  options,
) {
  return reactrouterv6CompatUtils.createReactRouterV6CompatibleTracingIntegration(options, '6');
}

/**
 * A wrapper function that adds Sentry routing instrumentation to a React Router v6 useRoutes hook.
 * This is used to automatically capture route changes as transactions when using the useRoutes hook.
 */
function wrapUseRoutesV6(origUseRoutes) {
  return reactrouterv6CompatUtils.createV6CompatibleWrapUseRoutes(origUseRoutes, '6');
}

/**
 * A wrapper function that adds Sentry routing instrumentation to a React Router v6 createBrowserRouter function.
 * This is used to automatically capture route changes as transactions when using the createBrowserRouter API.
 */
function wrapCreateBrowserRouterV6

(createRouterFunction) {
  return reactrouterv6CompatUtils.createV6CompatibleWrapCreateBrowserRouter(createRouterFunction, '6');
}

/**
 * A wrapper function that adds Sentry routing instrumentation to a React Router v6 createMemoryRouter function.
 * This is used to automatically capture route changes as transactions when using the createMemoryRouter API.
 * The difference between createBrowserRouter and createMemoryRouter is that with createMemoryRouter,
 * optional `initialEntries` are also taken into account.
 */
function wrapCreateMemoryRouterV6

(createMemoryRouterFunction) {
  return reactrouterv6CompatUtils.createV6CompatibleWrapCreateMemoryRouter(createMemoryRouterFunction, '6');
}

/**
 * A higher-order component that adds Sentry routing instrumentation to a React Router v6 Route component.
 * This is used to automatically capture route changes as transactions.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withSentryReactRouterV6Routing(routes) {
  return reactrouterv6CompatUtils.createV6CompatibleWithSentryReactRouterRouting(routes, '6');
}

exports.reactRouterV6BrowserTracingIntegration = reactRouterV6BrowserTracingIntegration;
exports.withSentryReactRouterV6Routing = withSentryReactRouterV6Routing;
exports.wrapCreateBrowserRouterV6 = wrapCreateBrowserRouterV6;
exports.wrapCreateMemoryRouterV6 = wrapCreateMemoryRouterV6;
exports.wrapUseRoutesV6 = wrapUseRoutesV6;
//# sourceMappingURL=reactrouterv6.js.map
