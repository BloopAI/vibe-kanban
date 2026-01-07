Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const browser = require('@sentry/browser');
const core = require('@sentry/core');

/**
 * A custom browser tracing integration for TanStack Router.
 *
 * The minimum compatible version of `@tanstack/react-router` is `1.64.0`.
 *
 * @param router A TanStack Router `Router` instance that should be used for routing instrumentation.
 * @param options Sentry browser tracing configuration.
 */
function tanstackRouterBrowserTracingIntegration(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  router, // This is `any` because we don't want any type mismatches if TanStack Router changes their types
  options = {},
) {
  const castRouterInstance = router;

  const browserTracingIntegrationInstance = browser.browserTracingIntegration({
    ...options,
    instrumentNavigation: false,
    instrumentPageLoad: false,
  });

  const { instrumentPageLoad = true, instrumentNavigation = true } = options;

  return {
    ...browserTracingIntegrationInstance,
    afterAllSetup(client) {
      browserTracingIntegrationInstance.afterAllSetup(client);

      const initialWindowLocation = browser.WINDOW.location;
      if (instrumentPageLoad && initialWindowLocation) {
        const matchedRoutes = castRouterInstance.matchRoutes(
          initialWindowLocation.pathname,
          castRouterInstance.options.parseSearch(initialWindowLocation.search),
          { preload: false, throwOnError: false },
        );

        const lastMatch = matchedRoutes[matchedRoutes.length - 1];

        browser.startBrowserTracingPageLoadSpan(client, {
          name: lastMatch ? lastMatch.routeId : initialWindowLocation.pathname,
          attributes: {
            [core.SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
            [core.SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.react.tanstack_router',
            [core.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: lastMatch ? 'route' : 'url',
            ...routeMatchToParamSpanAttributes(lastMatch),
          },
        });
      }

      if (instrumentNavigation) {
        // The onBeforeNavigate hook is called at the very beginning of a navigation and is only called once per navigation, even when the user is redirected
        castRouterInstance.subscribe('onBeforeNavigate', onBeforeNavigateArgs => {
          // onBeforeNavigate is called during pageloads. We can avoid creating navigation spans by comparing the states of the to and from arguments.
          if (onBeforeNavigateArgs.toLocation.state === onBeforeNavigateArgs.fromLocation?.state) {
            return;
          }

          const onResolvedMatchedRoutes = castRouterInstance.matchRoutes(
            onBeforeNavigateArgs.toLocation.pathname,
            onBeforeNavigateArgs.toLocation.search,
            { preload: false, throwOnError: false },
          );

          const onBeforeNavigateLastMatch = onResolvedMatchedRoutes[onResolvedMatchedRoutes.length - 1];

          const navigationLocation = browser.WINDOW.location;
          const navigationSpan = browser.startBrowserTracingNavigationSpan(client, {
            name: onBeforeNavigateLastMatch ? onBeforeNavigateLastMatch.routeId : navigationLocation.pathname,
            attributes: {
              [core.SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
              [core.SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.tanstack_router',
              [core.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: onBeforeNavigateLastMatch ? 'route' : 'url',
            },
          });

          // In case the user is redirected during navigation we want to update the span with the right value.
          const unsubscribeOnResolved = castRouterInstance.subscribe('onResolved', onResolvedArgs => {
            unsubscribeOnResolved();
            if (navigationSpan) {
              const onResolvedMatchedRoutes = castRouterInstance.matchRoutes(
                onResolvedArgs.toLocation.pathname,
                onResolvedArgs.toLocation.search,
                { preload: false, throwOnError: false },
              );

              const onResolvedLastMatch = onResolvedMatchedRoutes[onResolvedMatchedRoutes.length - 1];

              if (onResolvedLastMatch) {
                navigationSpan.updateName(onResolvedLastMatch.routeId);
                navigationSpan.setAttribute(core.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
                navigationSpan.setAttributes(routeMatchToParamSpanAttributes(onResolvedLastMatch));
              }
            }
          });
        });
      }
    },
  };
}

function routeMatchToParamSpanAttributes(match) {
  if (!match) {
    return {};
  }

  const paramAttributes = {};
  Object.entries(match.params).forEach(([key, value]) => {
    paramAttributes[`url.path.params.${key}`] = value; // todo(v10): remove attribute which does not adhere to Sentry's semantic convention
    paramAttributes[`url.path.parameter.${key}`] = value;
    paramAttributes[`params.${key}`] = value; // params.[key] is an alias
  });

  return paramAttributes;
}

exports.tanstackRouterBrowserTracingIntegration = tanstackRouterBrowserTracingIntegration;
//# sourceMappingURL=tanstackrouter.js.map
