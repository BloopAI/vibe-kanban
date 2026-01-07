Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const reactrouterv6CompatUtils = require('./reactrouterv6-compat-utils.js');

/**
 * A browser tracing integration that uses React Router v7 to instrument navigations.
 * Expects `useEffect`, `useLocation`, `useNavigationType`, `createRoutesFromChildren` and `matchRoutes` to be passed as options.
 */
function reactRouterV7BrowserTracingIntegration(
  options,
) {
  return reactrouterv6CompatUtils.createReactRouterV6CompatibleTracingIntegration(options, '7');
}

/**
 * A higher-order component that adds Sentry routing instrumentation to a React Router v7 Route component.
 * This is used to automatically capture route changes as transactions.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withSentryReactRouterV7Routing(routes) {
  return reactrouterv6CompatUtils.createV6CompatibleWithSentryReactRouterRouting(routes, '7');
}

/**
 * A wrapper function that adds Sentry routing instrumentation to a React Router v7 createBrowserRouter function.
 * This is used to automatically capture route changes as transactions when using the createBrowserRouter API.
 */
function wrapCreateBrowserRouterV7

(createRouterFunction) {
  return reactrouterv6CompatUtils.createV6CompatibleWrapCreateBrowserRouter(createRouterFunction, '7');
}

/**
 * A wrapper function that adds Sentry routing instrumentation to a React Router v7 createMemoryRouter function.
 * This is used to automatically capture route changes as transactions when using the createMemoryRouter API.
 * The difference between createBrowserRouter and createMemoryRouter is that with createMemoryRouter,
 * optional `initialEntries` are also taken into account.
 */
function wrapCreateMemoryRouterV7

(createMemoryRouterFunction) {
  return reactrouterv6CompatUtils.createV6CompatibleWrapCreateMemoryRouter(createMemoryRouterFunction, '7');
}

/**
 * A wrapper function that adds Sentry routing instrumentation to a React Router v7 useRoutes hook.
 * This is used to automatically capture route changes as transactions when using the useRoutes hook.
 */
function wrapUseRoutesV7(origUseRoutes) {
  return reactrouterv6CompatUtils.createV6CompatibleWrapUseRoutes(origUseRoutes, '7');
}

exports.reactRouterV7BrowserTracingIntegration = reactRouterV7BrowserTracingIntegration;
exports.withSentryReactRouterV7Routing = withSentryReactRouterV7Routing;
exports.wrapCreateBrowserRouterV7 = wrapCreateBrowserRouterV7;
exports.wrapCreateMemoryRouterV7 = wrapCreateMemoryRouterV7;
exports.wrapUseRoutesV7 = wrapUseRoutesV7;
//# sourceMappingURL=reactrouterv7.js.map
