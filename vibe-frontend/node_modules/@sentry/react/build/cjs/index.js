Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const browser = require('@sentry/browser');
const sdk = require('./sdk.js');
const error = require('./error.js');
const profiler = require('./profiler.js');
const errorboundary = require('./errorboundary.js');
const redux = require('./redux.js');
const reactrouterv3 = require('./reactrouterv3.js');
const tanstackrouter = require('./tanstackrouter.js');
const reactrouter = require('./reactrouter.js');
const reactrouterv6 = require('./reactrouterv6.js');
const reactrouterv7 = require('./reactrouterv7.js');



exports.init = sdk.init;
exports.captureReactException = error.captureReactException;
exports.reactErrorHandler = error.reactErrorHandler;
exports.Profiler = profiler.Profiler;
exports.useProfiler = profiler.useProfiler;
exports.withProfiler = profiler.withProfiler;
exports.ErrorBoundary = errorboundary.ErrorBoundary;
exports.withErrorBoundary = errorboundary.withErrorBoundary;
exports.createReduxEnhancer = redux.createReduxEnhancer;
exports.reactRouterV3BrowserTracingIntegration = reactrouterv3.reactRouterV3BrowserTracingIntegration;
exports.tanstackRouterBrowserTracingIntegration = tanstackrouter.tanstackRouterBrowserTracingIntegration;
exports.reactRouterV4BrowserTracingIntegration = reactrouter.reactRouterV4BrowserTracingIntegration;
exports.reactRouterV5BrowserTracingIntegration = reactrouter.reactRouterV5BrowserTracingIntegration;
exports.withSentryRouting = reactrouter.withSentryRouting;
exports.reactRouterV6BrowserTracingIntegration = reactrouterv6.reactRouterV6BrowserTracingIntegration;
exports.withSentryReactRouterV6Routing = reactrouterv6.withSentryReactRouterV6Routing;
exports.wrapCreateBrowserRouterV6 = reactrouterv6.wrapCreateBrowserRouterV6;
exports.wrapCreateMemoryRouterV6 = reactrouterv6.wrapCreateMemoryRouterV6;
exports.wrapUseRoutesV6 = reactrouterv6.wrapUseRoutesV6;
exports.reactRouterV7BrowserTracingIntegration = reactrouterv7.reactRouterV7BrowserTracingIntegration;
exports.withSentryReactRouterV7Routing = reactrouterv7.withSentryReactRouterV7Routing;
exports.wrapCreateBrowserRouterV7 = reactrouterv7.wrapCreateBrowserRouterV7;
exports.wrapCreateMemoryRouterV7 = reactrouterv7.wrapCreateMemoryRouterV7;
exports.wrapUseRoutesV7 = reactrouterv7.wrapUseRoutesV7;
Object.prototype.hasOwnProperty.call(browser, '__proto__') &&
  !Object.prototype.hasOwnProperty.call(exports, '__proto__') &&
  Object.defineProperty(exports, '__proto__', {
    enumerable: true,
    value: browser['__proto__']
  });

Object.keys(browser).forEach(k => {
  if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) exports[k] = browser[k];
});
//# sourceMappingURL=index.js.map
