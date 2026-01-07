import { browserTracingIntegration, WINDOW, startBrowserTracingPageLoadSpan, startBrowserTracingNavigationSpan } from '@sentry/browser';
import { SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SEMANTIC_ATTRIBUTE_SENTRY_OP } from '@sentry/core';

// Many of the types below had to be mocked out to prevent typescript issues
// these types are required for correct functionality.

/**
 * A browser tracing integration that uses React Router v3 to instrument navigations.
 * Expects `history` (and optionally `routes` and `matchPath`) to be passed as options.
 */
function reactRouterV3BrowserTracingIntegration(
  options,
) {
  const integration = browserTracingIntegration({
    ...options,
    instrumentPageLoad: false,
    instrumentNavigation: false,
  });

  const { history, routes, match, instrumentPageLoad = true, instrumentNavigation = true } = options;

  return {
    ...integration,
    afterAllSetup(client) {
      integration.afterAllSetup(client);

      if (instrumentPageLoad && WINDOW.location) {
        normalizeTransactionName(
          routes,
          WINDOW.location ,
          match,
          (localName, source = 'url') => {
            startBrowserTracingPageLoadSpan(client, {
              name: localName,
              attributes: {
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.react.reactrouter_v3',
                [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: source,
              },
            });
          },
        );
      }

      if (instrumentNavigation && history.listen) {
        history.listen(location => {
          if (location.action === 'PUSH' || location.action === 'POP') {
            normalizeTransactionName(
              routes,
              location,
              match,
              (localName, source = 'url') => {
                startBrowserTracingNavigationSpan(client, {
                  name: localName,
                  attributes: {
                    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
                    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v3',
                    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: source,
                  },
                });
              },
            );
          }
        });
      }
    },
  };
}

/**
 * Normalize transaction names using `Router.match`
 */
function normalizeTransactionName(
  appRoutes,
  location,
  match,
  callback,
) {
  let name = location.pathname;
  match(
    {
      location,
      routes: appRoutes,
    },
    (error, _redirectLocation, renderProps) => {
      if (error || !renderProps) {
        return callback(name);
      }

      const routePath = getRouteStringFromRoutes(renderProps.routes || []);
      if (routePath.length === 0 || routePath === '/*') {
        return callback(name);
      }

      name = routePath;
      return callback(name, 'route');
    },
  );
}

/**
 * Generate route name from array of routes
 */
function getRouteStringFromRoutes(routes) {
  if (!Array.isArray(routes) || routes.length === 0) {
    return '';
  }

  const routesWithPaths = routes.filter((route) => !!route.path);

  let index = -1;
  for (let x = routesWithPaths.length - 1; x >= 0; x--) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const route = routesWithPaths[x];
    if (route.path?.startsWith('/')) {
      index = x;
      break;
    }
  }

  return routesWithPaths.slice(index).reduce((acc, { path }) => {
    const pathSegment = acc === '/' || acc === '' ? path : `/${path}`;
    return `${acc}${pathSegment}`;
  }, '');
}

export { reactRouterV3BrowserTracingIntegration };
//# sourceMappingURL=reactrouterv3.js.map
