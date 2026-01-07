Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const browser = require('@sentry/browser');
const core = require('@sentry/core');
const React = require('react');
const debugBuild = require('./debug-build.js');
const hoistNonReactStatics = require('./hoist-non-react-statics.js');

/* eslint-disable max-lines */
// Inspired from Donnie McNeal's solution:
// https://gist.github.com/wontondon/e8c4bdf2888875e4c755712e99279536


let _useEffect;
let _useLocation;
let _useNavigationType;
let _createRoutesFromChildren;
let _matchRoutes;
let _stripBasename = false;

const CLIENTS_WITH_INSTRUMENT_NAVIGATION = new WeakSet();

// Keeping as a global variable for cross-usage in multiple functions
const allRoutes = new Set();

/**
 * Creates a wrapCreateBrowserRouter function that can be used with all React Router v6 compatible versions.
 */
function createV6CompatibleWrapCreateBrowserRouter

(
  createRouterFunction,
  version,
) {
  if (!_useEffect || !_useLocation || !_useNavigationType || !_matchRoutes) {
    debugBuild.DEBUG_BUILD &&
      core.debug.warn(
        `reactRouterV${version}Instrumentation was unable to wrap the \`createRouter\` function because of one or more missing parameters.`,
      );

    return createRouterFunction;
  }

  return function (routes, opts) {
    addRoutesToAllRoutes(routes);

    const router = createRouterFunction(routes, opts);
    const basename = opts?.basename;

    const activeRootSpan = getActiveRootSpan();

    // The initial load ends when `createBrowserRouter` is called.
    // This is the earliest convenient time to update the transaction name.
    // Callbacks to `router.subscribe` are not called for the initial load.
    if (router.state.historyAction === 'POP' && activeRootSpan) {
      updatePageloadTransaction(
        activeRootSpan,
        router.state.location,
        routes,
        undefined,
        basename,
        Array.from(allRoutes),
      );
    }

    router.subscribe((state) => {
      if (state.historyAction === 'PUSH' || state.historyAction === 'POP') {
        // Wait for the next render if loading an unsettled route
        if (state.navigation.state !== 'idle') {
          requestAnimationFrame(() => {
            handleNavigation({
              location: state.location,
              routes,
              navigationType: state.historyAction,
              version,
              basename,
              allRoutes: Array.from(allRoutes),
            });
          });
        } else {
          handleNavigation({
            location: state.location,
            routes,
            navigationType: state.historyAction,
            version,
            basename,
            allRoutes: Array.from(allRoutes),
          });
        }
      }
    });

    return router;
  };
}

/**
 * Creates a wrapCreateMemoryRouter function that can be used with all React Router v6 compatible versions.
 */
function createV6CompatibleWrapCreateMemoryRouter

(
  createRouterFunction,
  version,
) {
  if (!_useEffect || !_useLocation || !_useNavigationType || !_matchRoutes) {
    debugBuild.DEBUG_BUILD &&
      core.debug.warn(
        `reactRouterV${version}Instrumentation was unable to wrap the \`createMemoryRouter\` function because of one or more missing parameters.`,
      );

    return createRouterFunction;
  }

  return function (
    routes,
    opts

,
  ) {
    addRoutesToAllRoutes(routes);

    const router = createRouterFunction(routes, opts);
    const basename = opts?.basename;

    const activeRootSpan = getActiveRootSpan();
    let initialEntry = undefined;

    const initialEntries = opts?.initialEntries;
    const initialIndex = opts?.initialIndex;

    const hasOnlyOneInitialEntry = initialEntries && initialEntries.length === 1;
    const hasIndexedEntry = initialIndex !== undefined && initialEntries && initialEntries[initialIndex];

    initialEntry = hasOnlyOneInitialEntry
      ? initialEntries[0]
      : hasIndexedEntry
        ? initialEntries[initialIndex]
        : undefined;

    const location = initialEntry
      ? typeof initialEntry === 'string'
        ? { pathname: initialEntry }
        : initialEntry
      : router.state.location;

    if (router.state.historyAction === 'POP' && activeRootSpan) {
      updatePageloadTransaction(activeRootSpan, location, routes, undefined, basename, Array.from(allRoutes));
    }

    router.subscribe((state) => {
      const location = state.location;
      if (state.historyAction === 'PUSH' || state.historyAction === 'POP') {
        handleNavigation({
          location,
          routes,
          navigationType: state.historyAction,
          version,
          basename,
          allRoutes: Array.from(allRoutes),
        });
      }
    });

    return router;
  };
}

/**
 * Creates a browser tracing integration that can be used with all React Router v6 compatible versions.
 */
function createReactRouterV6CompatibleTracingIntegration(
  options,
  version,
) {
  const integration = browser.browserTracingIntegration({
    ...options,
    instrumentPageLoad: false,
    instrumentNavigation: false,
  });

  const {
    useEffect,
    useLocation,
    useNavigationType,
    createRoutesFromChildren,
    matchRoutes,
    stripBasename,
    instrumentPageLoad = true,
    instrumentNavigation = true,
  } = options;

  return {
    ...integration,
    setup(client) {
      integration.setup(client);

      _useEffect = useEffect;
      _useLocation = useLocation;
      _useNavigationType = useNavigationType;
      _matchRoutes = matchRoutes;
      _createRoutesFromChildren = createRoutesFromChildren;
      _stripBasename = stripBasename || false;
    },
    afterAllSetup(client) {
      integration.afterAllSetup(client);

      const initPathName = browser.WINDOW.location?.pathname;
      if (instrumentPageLoad && initPathName) {
        browser.startBrowserTracingPageLoadSpan(client, {
          name: initPathName,
          attributes: {
            [core.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
            [core.SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
            [core.SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: `auto.pageload.react.reactrouter_v${version}`,
          },
        });
      }

      if (instrumentNavigation) {
        CLIENTS_WITH_INSTRUMENT_NAVIGATION.add(client);
      }
    },
  };
}

function createV6CompatibleWrapUseRoutes(origUseRoutes, version) {
  if (!_useEffect || !_useLocation || !_useNavigationType || !_matchRoutes) {
    debugBuild.DEBUG_BUILD &&
      core.debug.warn(
        'reactRouterV6Instrumentation was unable to wrap `useRoutes` because of one or more missing parameters.',
      );

    return origUseRoutes;
  }

  const SentryRoutes

 = (props) => {
    const isMountRenderPass = React.useRef(true);
    const { routes, locationArg } = props;

    const Routes = origUseRoutes(routes, locationArg);

    const location = _useLocation();
    const navigationType = _useNavigationType();

    // A value with stable identity to either pick `locationArg` if available or `location` if not
    const stableLocationParam =
      typeof locationArg === 'string' || locationArg?.pathname ? (locationArg ) : location;

    _useEffect(() => {
      const normalizedLocation =
        typeof stableLocationParam === 'string' ? { pathname: stableLocationParam } : stableLocationParam;

      if (isMountRenderPass.current) {
        addRoutesToAllRoutes(routes);

        updatePageloadTransaction(
          getActiveRootSpan(),
          normalizedLocation,
          routes,
          undefined,
          undefined,
          Array.from(allRoutes),
        );
        isMountRenderPass.current = false;
      } else {
        handleNavigation({
          location: normalizedLocation,
          routes,
          navigationType,
          version,
          allRoutes: Array.from(allRoutes),
        });
      }
    }, [navigationType, stableLocationParam]);

    return Routes;
  };

  // eslint-disable-next-line react/display-name
  return (routes, locationArg) => {
    return React.createElement(SentryRoutes, { routes: routes, locationArg: locationArg,} );
  };
}

function handleNavigation(opts

) {
  const { location, routes, navigationType, version, matches, basename, allRoutes } = opts;
  const branches = Array.isArray(matches) ? matches : _matchRoutes(routes, location, basename);

  const client = core.getClient();
  if (!client || !CLIENTS_WITH_INSTRUMENT_NAVIGATION.has(client)) {
    return;
  }

  if ((navigationType === 'PUSH' || navigationType === 'POP') && branches) {
    let name,
      source = 'url';
    const isInDescendantRoute = locationIsInsideDescendantRoute(location, allRoutes || routes);

    if (isInDescendantRoute) {
      name = prefixWithSlash(rebuildRoutePathFromAllRoutes(allRoutes || routes, location));
      source = 'route';
    }

    if (!isInDescendantRoute || !name) {
      [name, source] = getNormalizedName(routes, location, branches, basename);
    }

    const activeSpan = core.getActiveSpan();
    const isAlreadyInNavigationSpan = activeSpan && core.spanToJSON(activeSpan).op === 'navigation';

    // Cross usage can result in multiple navigation spans being created without this check
    if (isAlreadyInNavigationSpan) {
      activeSpan?.updateName(name);
      activeSpan?.setAttribute(core.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, source);
    } else {
      browser.startBrowserTracingNavigationSpan(client, {
        name,
        attributes: {
          [core.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: source,
          [core.SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [core.SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: `auto.navigation.react.reactrouter_v${version}`,
        },
      });
    }
  }
}

/**
 * Strip the basename from a pathname if exists.
 *
 * Vendored and modified from `react-router`
 * https://github.com/remix-run/react-router/blob/462bb712156a3f739d6139a0f14810b76b002df6/packages/router/utils.ts#L1038
 */
function stripBasenameFromPathname(pathname, basename) {
  if (!basename || basename === '/') {
    return pathname;
  }

  if (!pathname.toLowerCase().startsWith(basename.toLowerCase())) {
    return pathname;
  }

  // We want to leave trailing slash behavior in the user's control, so if they
  // specify a basename with a trailing slash, we should support it
  const startIndex = basename.endsWith('/') ? basename.length - 1 : basename.length;
  const nextChar = pathname.charAt(startIndex);
  if (nextChar && nextChar !== '/') {
    // pathname does not start with basename/
    return pathname;
  }

  return pathname.slice(startIndex) || '/';
}

function sendIndexPath(pathBuilder, pathname, basename) {
  const reconstructedPath = pathBuilder || _stripBasename ? stripBasenameFromPathname(pathname, basename) : pathname;

  const formattedPath =
    // If the path ends with a slash, remove it
    reconstructedPath[reconstructedPath.length - 1] === '/'
      ? reconstructedPath.slice(0, -1)
      : // If the path ends with a wildcard, remove it
        reconstructedPath.slice(-2) === '/*'
        ? reconstructedPath.slice(0, -1)
        : reconstructedPath;

  return [formattedPath, 'route'];
}

function pathEndsWithWildcard(path) {
  return path.endsWith('*');
}

function pathIsWildcardAndHasChildren(path, branch) {
  return (pathEndsWithWildcard(path) && !!branch.route.children?.length) || false;
}

function routeIsDescendant(route) {
  return !!(!route.children && route.element && route.path?.endsWith('/*'));
}

function locationIsInsideDescendantRoute(location, routes) {
  const matchedRoutes = _matchRoutes(routes, location) ;

  if (matchedRoutes) {
    for (const match of matchedRoutes) {
      if (routeIsDescendant(match.route) && pickSplat(match)) {
        return true;
      }
    }
  }

  return false;
}

function addRoutesToAllRoutes(routes) {
  routes.forEach(route => {
    const extractedChildRoutes = getChildRoutesRecursively(route);

    extractedChildRoutes.forEach(r => {
      allRoutes.add(r);
    });
  });
}

function getChildRoutesRecursively(route, allRoutes = new Set()) {
  if (!allRoutes.has(route)) {
    allRoutes.add(route);

    if (route.children && !route.index) {
      route.children.forEach(child => {
        const childRoutes = getChildRoutesRecursively(child, allRoutes);

        childRoutes.forEach(r => {
          allRoutes.add(r);
        });
      });
    }
  }

  return allRoutes;
}

function pickPath(match) {
  return trimWildcard(match.route.path || '');
}

function pickSplat(match) {
  return match.params['*'] || '';
}

function trimWildcard(path) {
  return path[path.length - 1] === '*' ? path.slice(0, -1) : path;
}

function trimSlash(path) {
  return path[path.length - 1] === '/' ? path.slice(0, -1) : path;
}

function prefixWithSlash(path) {
  return path[0] === '/' ? path : `/${path}`;
}

function rebuildRoutePathFromAllRoutes(allRoutes, location) {
  const matchedRoutes = _matchRoutes(allRoutes, location) ;

  if (!matchedRoutes || matchedRoutes.length === 0) {
    return '';
  }

  for (const match of matchedRoutes) {
    if (match.route.path && match.route.path !== '*') {
      const path = pickPath(match);
      const strippedPath = stripBasenameFromPathname(location.pathname, prefixWithSlash(match.pathnameBase));

      if (location.pathname === strippedPath) {
        return trimSlash(strippedPath);
      }

      return trimSlash(
        trimSlash(path || '') +
          prefixWithSlash(
            rebuildRoutePathFromAllRoutes(
              allRoutes.filter(route => route !== match.route),
              {
                pathname: strippedPath,
              },
            ),
          ),
      );
    }
  }

  return '';
}

function getNormalizedName(
  routes,
  location,
  branches,
  basename = '',
) {
  if (!routes || routes.length === 0) {
    return [_stripBasename ? stripBasenameFromPathname(location.pathname, basename) : location.pathname, 'url'];
  }

  let pathBuilder = '';
  if (branches) {
    for (const branch of branches) {
      const route = branch.route;
      if (route) {
        // Early return if index route
        if (route.index) {
          return sendIndexPath(pathBuilder, branch.pathname, basename);
        }
        const path = route.path;

        // If path is not a wildcard and has no child routes, append the path
        if (path && !pathIsWildcardAndHasChildren(path, branch)) {
          const newPath = path[0] === '/' || pathBuilder[pathBuilder.length - 1] === '/' ? path : `/${path}`;
          pathBuilder = trimSlash(pathBuilder) + prefixWithSlash(newPath);

          // If the path matches the current location, return the path
          if (trimSlash(location.pathname) === trimSlash(basename + branch.pathname)) {
            if (
              // If the route defined on the element is something like
              // <Route path="/stores/:storeId/products/:productId" element={<div>Product</div>} />
              // We should check against the branch.pathname for the number of / separators
              getNumberOfUrlSegments(pathBuilder) !== getNumberOfUrlSegments(branch.pathname) &&
              // We should not count wildcard operators in the url segments calculation
              !pathEndsWithWildcard(pathBuilder)
            ) {
              return [(_stripBasename ? '' : basename) + newPath, 'route'];
            }

            // if the last character of the pathbuilder is a wildcard and there are children, remove the wildcard
            if (pathIsWildcardAndHasChildren(pathBuilder, branch)) {
              pathBuilder = pathBuilder.slice(0, -1);
            }

            return [(_stripBasename ? '' : basename) + pathBuilder, 'route'];
          }
        }
      }
    }
  }

  const fallbackTransactionName = _stripBasename
    ? stripBasenameFromPathname(location.pathname, basename)
    : location.pathname || '/';

  return [fallbackTransactionName, 'url'];
}

function updatePageloadTransaction(
  activeRootSpan,
  location,
  routes,
  matches,
  basename,
  allRoutes,
) {
  const branches = Array.isArray(matches)
    ? matches
    : (_matchRoutes(allRoutes || routes, location, basename) );

  if (branches) {
    let name,
      source = 'url';

    const isInDescendantRoute = locationIsInsideDescendantRoute(location, allRoutes || routes);

    if (isInDescendantRoute) {
      name = prefixWithSlash(rebuildRoutePathFromAllRoutes(allRoutes || routes, location));
      source = 'route';
    }

    if (!isInDescendantRoute || !name) {
      [name, source] = getNormalizedName(routes, location, branches, basename);
    }

    core.getCurrentScope().setTransactionName(name || '/');

    if (activeRootSpan) {
      activeRootSpan.updateName(name);
      activeRootSpan.setAttribute(core.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, source);
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createV6CompatibleWithSentryReactRouterRouting(
  Routes,
  version,
) {
  if (!_useEffect || !_useLocation || !_useNavigationType || !_createRoutesFromChildren || !_matchRoutes) {
    debugBuild.DEBUG_BUILD &&
      core.debug.warn(`reactRouterV6Instrumentation was unable to wrap Routes because of one or more missing parameters.
      useEffect: ${_useEffect}. useLocation: ${_useLocation}. useNavigationType: ${_useNavigationType}.
      createRoutesFromChildren: ${_createRoutesFromChildren}. matchRoutes: ${_matchRoutes}.`);

    return Routes;
  }

  const SentryRoutes = (props) => {
    const isMountRenderPass = React.useRef(true);

    const location = _useLocation();
    const navigationType = _useNavigationType();

    _useEffect(
      () => {
        const routes = _createRoutesFromChildren(props.children) ;

        if (isMountRenderPass.current) {
          addRoutesToAllRoutes(routes);

          updatePageloadTransaction(getActiveRootSpan(), location, routes, undefined, undefined, Array.from(allRoutes));
          isMountRenderPass.current = false;
        } else {
          handleNavigation({
            location,
            routes,
            navigationType,
            version,
            allRoutes: Array.from(allRoutes),
          });
        }
      },
      // `props.children` is purposely not included in the dependency array, because we do not want to re-run this effect
      // when the children change. We only want to start transactions when the location or navigation type change.
      [location, navigationType],
    );

    // @ts-expect-error Setting more specific React Component typing for `R` generic above
    // will break advanced type inference done by react router params
    return React.createElement(Routes, { ...props,} );
  };

  hoistNonReactStatics.hoistNonReactStatics(SentryRoutes, Routes);

  // @ts-expect-error Setting more specific React Component typing for `R` generic above
  // will break advanced type inference done by react router params
  return SentryRoutes;
}

function getActiveRootSpan() {
  const span = core.getActiveSpan();
  const rootSpan = span ? core.getRootSpan(span) : undefined;

  if (!rootSpan) {
    return undefined;
  }

  const op = core.spanToJSON(rootSpan).op;

  // Only use this root span if it is a pageload or navigation span
  return op === 'navigation' || op === 'pageload' ? rootSpan : undefined;
}

/**
 * Returns number of URL segments of a passed string URL.
 */
function getNumberOfUrlSegments(url) {
  // split at '/' or at '\/' to split regex urls correctly
  return url.split(/\\?\//).filter(s => s.length > 0 && s !== ',').length;
}

exports.createReactRouterV6CompatibleTracingIntegration = createReactRouterV6CompatibleTracingIntegration;
exports.createV6CompatibleWithSentryReactRouterRouting = createV6CompatibleWithSentryReactRouterRouting;
exports.createV6CompatibleWrapCreateBrowserRouter = createV6CompatibleWrapCreateBrowserRouter;
exports.createV6CompatibleWrapCreateMemoryRouter = createV6CompatibleWrapCreateMemoryRouter;
exports.createV6CompatibleWrapUseRoutes = createV6CompatibleWrapUseRoutes;
exports.getNumberOfUrlSegments = getNumberOfUrlSegments;
exports.handleNavigation = handleNavigation;
//# sourceMappingURL=reactrouterv6-compat-utils.js.map
