import { TRACING_DEFAULTS, getLocationHref, browserPerformanceTimeOrigin, parseStringToURLObject, registerSpanErrorInstrumentation, GLOBAL_OBJ, getClient, debug, getIsolationScope, generateTraceId, getCurrentScope, propagationContextFromHeaders, spanToJSON, dateTimestampInSeconds, timestampInSeconds, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, startInactiveSpan, startIdleSpan, getDynamicSamplingContextFromSpan, spanIsSampled, SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON, addNonEnumerableProperty, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { addHistoryInstrumentationHandler, registerInpInteractionListener, startTrackingWebVitals, startTrackingINP, startTrackingElementTiming, startTrackingLongAnimationFrames, startTrackingLongTasks, startTrackingInteractions, addPerformanceEntries } from '@sentry-internal/browser-utils';
import { DEBUG_BUILD } from '../debug-build.js';
import { WINDOW, getHttpRequestData } from '../helpers.js';
import { registerBackgroundTabDetection } from './backgroundtab.js';
import { linkTraces } from './linkedTraces.js';
import { defaultRequestInstrumentationOptions, instrumentOutgoingRequests } from './request.js';

const BROWSER_TRACING_INTEGRATION_ID = 'BrowserTracing';

const DEFAULT_BROWSER_TRACING_OPTIONS = {
  ...TRACING_DEFAULTS,
  instrumentNavigation: true,
  instrumentPageLoad: true,
  markBackgroundSpan: true,
  enableLongTask: true,
  enableLongAnimationFrame: true,
  enableInp: true,
  enableElementTiming: true,
  ignoreResourceSpans: [],
  ignorePerformanceApiSpans: [],
  detectRedirects: true,
  linkPreviousTrace: 'in-memory',
  consistentTraceSampling: false,
  _experiments: {},
  ...defaultRequestInstrumentationOptions,
};

/**
 * The Browser Tracing integration automatically instruments browser pageload/navigation
 * actions as transactions, and captures requests, metrics and errors as spans.
 *
 * The integration can be configured with a variety of options, and can be extended to use
 * any routing library.
 *
 * We explicitly export the proper type here, as this has to be extended in some cases.
 */
const browserTracingIntegration = ((_options = {}) => {
  const latestRoute = {
    name: undefined,
    source: undefined,
  };

  /**
   * This is just a small wrapper that makes `document` optional.
   * We want to be extra-safe and always check that this exists, to ensure weird environments do not blow up.
   */
  const optionalWindowDocument = WINDOW.document ;

  const {
    enableInp,
    enableElementTiming,
    enableLongTask,
    enableLongAnimationFrame,
    _experiments: { enableInteractions, enableStandaloneClsSpans, enableStandaloneLcpSpans },
    beforeStartSpan,
    idleTimeout,
    finalTimeout,
    childSpanTimeout,
    markBackgroundSpan,
    traceFetch,
    traceXHR,
    trackFetchStreamPerformance,
    shouldCreateSpanForRequest,
    enableHTTPTimings,
    ignoreResourceSpans,
    ignorePerformanceApiSpans,
    instrumentPageLoad,
    instrumentNavigation,
    detectRedirects,
    linkPreviousTrace,
    consistentTraceSampling,
    onRequestSpanStart,
  } = {
    ...DEFAULT_BROWSER_TRACING_OPTIONS,
    ..._options,
  };

  let _collectWebVitals;
  let lastInteractionTimestamp;

  /** Create routing idle transaction. */
  function _createRouteSpan(client, startSpanOptions, makeActive = true) {
    const isPageloadTransaction = startSpanOptions.op === 'pageload';

    const finalStartSpanOptions = beforeStartSpan
      ? beforeStartSpan(startSpanOptions)
      : startSpanOptions;

    const attributes = finalStartSpanOptions.attributes || {};

    // If `finalStartSpanOptions.name` is different than `startSpanOptions.name`
    // it is because `beforeStartSpan` set a custom name. Therefore we set the source to 'custom'.
    if (startSpanOptions.name !== finalStartSpanOptions.name) {
      attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] = 'custom';
      finalStartSpanOptions.attributes = attributes;
    }

    if (!makeActive) {
      // We want to ensure this has 0s duration
      const now = dateTimestampInSeconds();
      startInactiveSpan({
        ...finalStartSpanOptions,
        startTime: now,
      }).end(now);
      return;
    }

    latestRoute.name = finalStartSpanOptions.name;
    latestRoute.source = attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE];

    const idleSpan = startIdleSpan(finalStartSpanOptions, {
      idleTimeout,
      finalTimeout,
      childSpanTimeout,
      // should wait for finish signal if it's a pageload transaction
      disableAutoFinish: isPageloadTransaction,
      beforeSpanEnd: span => {
        // This will generally always be defined here, because it is set in `setup()` of the integration
        // but technically, it is optional, so we guard here to be extra safe
        _collectWebVitals?.();
        addPerformanceEntries(span, {
          recordClsOnPageloadSpan: !enableStandaloneClsSpans,
          recordLcpOnPageloadSpan: !enableStandaloneLcpSpans,
          ignoreResourceSpans,
          ignorePerformanceApiSpans,
        });
        setActiveIdleSpan(client, undefined);

        // A trace should stay consistent over the entire timespan of one route - even after the pageload/navigation ended.
        // Only when another navigation happens, we want to create a new trace.
        // This way, e.g. errors that occur after the pageload span ended are still associated to the pageload trace.
        const scope = getCurrentScope();
        const oldPropagationContext = scope.getPropagationContext();

        scope.setPropagationContext({
          ...oldPropagationContext,
          traceId: idleSpan.spanContext().traceId,
          sampled: spanIsSampled(idleSpan),
          dsc: getDynamicSamplingContextFromSpan(span),
        });
      },
    });

    setActiveIdleSpan(client, idleSpan);

    function emitFinish() {
      if (optionalWindowDocument && ['interactive', 'complete'].includes(optionalWindowDocument.readyState)) {
        client.emit('idleSpanEnableAutoFinish', idleSpan);
      }
    }

    if (isPageloadTransaction && optionalWindowDocument) {
      optionalWindowDocument.addEventListener('readystatechange', () => {
        emitFinish();
      });

      emitFinish();
    }
  }

  return {
    name: BROWSER_TRACING_INTEGRATION_ID,
    setup(client) {
      registerSpanErrorInstrumentation();

      _collectWebVitals = startTrackingWebVitals({
        recordClsStandaloneSpans: enableStandaloneClsSpans || false,
        recordLcpStandaloneSpans: enableStandaloneLcpSpans || false,
        client,
      });

      if (enableInp) {
        startTrackingINP();
      }

      if (enableElementTiming) {
        startTrackingElementTiming();
      }

      if (
        enableLongAnimationFrame &&
        GLOBAL_OBJ.PerformanceObserver &&
        PerformanceObserver.supportedEntryTypes &&
        PerformanceObserver.supportedEntryTypes.includes('long-animation-frame')
      ) {
        startTrackingLongAnimationFrames();
      } else if (enableLongTask) {
        startTrackingLongTasks();
      }

      if (enableInteractions) {
        startTrackingInteractions();
      }

      if (detectRedirects && optionalWindowDocument) {
        const interactionHandler = () => {
          lastInteractionTimestamp = timestampInSeconds();
        };
        addEventListener('click', interactionHandler, { capture: true });
        addEventListener('keydown', interactionHandler, { capture: true, passive: true });
      }

      function maybeEndActiveSpan() {
        const activeSpan = getActiveIdleSpan(client);

        if (activeSpan && !spanToJSON(activeSpan).timestamp) {
          DEBUG_BUILD && debug.log(`[Tracing] Finishing current active span with op: ${spanToJSON(activeSpan).op}`);
          // If there's an open active span, we need to finish it before creating an new one.
          activeSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON, 'cancelled');
          activeSpan.end();
        }
      }

      client.on('startNavigationSpan', (startSpanOptions, navigationOptions) => {
        if (getClient() !== client) {
          return;
        }

        if (navigationOptions?.isRedirect) {
          DEBUG_BUILD &&
            debug.warn('[Tracing] Detected redirect, navigation span will not be the root span, but a child span.');
          _createRouteSpan(
            client,
            {
              op: 'navigation.redirect',
              ...startSpanOptions,
            },
            false,
          );
          return;
        }

        maybeEndActiveSpan();

        getIsolationScope().setPropagationContext({ traceId: generateTraceId(), sampleRand: Math.random() });

        const scope = getCurrentScope();
        scope.setPropagationContext({ traceId: generateTraceId(), sampleRand: Math.random() });
        // We reset this to ensure we do not have lingering incorrect data here
        // places that call this hook may set this where appropriate - else, the URL at span sending time is used
        scope.setSDKProcessingMetadata({
          normalizedRequest: undefined,
        });

        _createRouteSpan(client, {
          op: 'navigation',
          ...startSpanOptions,
        });
      });

      client.on('startPageLoadSpan', (startSpanOptions, traceOptions = {}) => {
        if (getClient() !== client) {
          return;
        }
        maybeEndActiveSpan();

        const sentryTrace = traceOptions.sentryTrace || getMetaContent('sentry-trace');
        const baggage = traceOptions.baggage || getMetaContent('baggage');

        const propagationContext = propagationContextFromHeaders(sentryTrace, baggage);

        const scope = getCurrentScope();
        scope.setPropagationContext(propagationContext);

        // We store the normalized request data on the scope, so we get the request data at time of span creation
        // otherwise, the URL etc. may already be of the following navigation, and we'd report the wrong URL
        scope.setSDKProcessingMetadata({
          normalizedRequest: getHttpRequestData(),
        });

        _createRouteSpan(client, {
          op: 'pageload',
          ...startSpanOptions,
        });
      });
    },
    afterAllSetup(client) {
      let startingUrl = getLocationHref();

      if (linkPreviousTrace !== 'off') {
        linkTraces(client, { linkPreviousTrace, consistentTraceSampling });
      }

      if (WINDOW.location) {
        if (instrumentPageLoad) {
          const origin = browserPerformanceTimeOrigin();
          startBrowserTracingPageLoadSpan(client, {
            name: WINDOW.location.pathname,
            // pageload should always start at timeOrigin (and needs to be in s, not ms)
            startTime: origin ? origin / 1000 : undefined,
            attributes: {
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.browser',
            },
          });
        }

        if (instrumentNavigation) {
          addHistoryInstrumentationHandler(({ to, from }) => {
            /**
             * This early return is there to account for some cases where a navigation transaction starts right after
             * long-running pageload. We make sure that if `from` is undefined and a valid `startingURL` exists, we don't
             * create an uneccessary navigation transaction.
             *
             * This was hard to duplicate, but this behavior stopped as soon as this fix was applied. This issue might also
             * only be caused in certain development environments where the usage of a hot module reloader is causing
             * errors.
             */
            if (from === undefined && startingUrl?.indexOf(to) !== -1) {
              startingUrl = undefined;
              return;
            }

            startingUrl = undefined;
            const parsed = parseStringToURLObject(to);
            const activeSpan = getActiveIdleSpan(client);
            const navigationIsRedirect =
              activeSpan && detectRedirects && isRedirect(activeSpan, lastInteractionTimestamp);
            startBrowserTracingNavigationSpan(
              client,
              {
                name: parsed?.pathname || WINDOW.location.pathname,
                attributes: {
                  [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
                  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.browser',
                },
              },
              { url: to, isRedirect: navigationIsRedirect },
            );
          });
        }
      }

      if (markBackgroundSpan) {
        registerBackgroundTabDetection();
      }

      if (enableInteractions) {
        registerInteractionListener(client, idleTimeout, finalTimeout, childSpanTimeout, latestRoute);
      }

      if (enableInp) {
        registerInpInteractionListener();
      }

      instrumentOutgoingRequests(client, {
        traceFetch,
        traceXHR,
        trackFetchStreamPerformance,
        tracePropagationTargets: client.getOptions().tracePropagationTargets,
        shouldCreateSpanForRequest,
        enableHTTPTimings,
        onRequestSpanStart,
      });
    },
  };
}) ;

/**
 * Manually start a page load span.
 * This will only do something if a browser tracing integration integration has been setup.
 *
 * If you provide a custom `traceOptions` object, it will be used to continue the trace
 * instead of the default behavior, which is to look it up on the <meta> tags.
 */
function startBrowserTracingPageLoadSpan(
  client,
  spanOptions,
  traceOptions,
) {
  client.emit('startPageLoadSpan', spanOptions, traceOptions);
  getCurrentScope().setTransactionName(spanOptions.name);

  const pageloadSpan = getActiveIdleSpan(client);

  if (pageloadSpan) {
    client.emit('afterStartPageLoadSpan', pageloadSpan);
  }

  return pageloadSpan;
}

/**
 * Manually start a navigation span.
 * This will only do something if a browser tracing integration has been setup.
 */
function startBrowserTracingNavigationSpan(
  client,
  spanOptions,
  options,
) {
  const { url, isRedirect } = options || {};
  client.emit('beforeStartNavigationSpan', spanOptions, { isRedirect });
  client.emit('startNavigationSpan', spanOptions, { isRedirect });

  const scope = getCurrentScope();
  scope.setTransactionName(spanOptions.name);

  // We store the normalized request data on the scope, so we get the request data at time of span creation
  // otherwise, the URL etc. may already be of the following navigation, and we'd report the wrong URL
  if (url && !isRedirect) {
    scope.setSDKProcessingMetadata({
      normalizedRequest: {
        ...getHttpRequestData(),
        url,
      },
    });
  }

  return getActiveIdleSpan(client);
}

/** Returns the value of a meta tag */
function getMetaContent(metaName) {
  /**
   * This is just a small wrapper that makes `document` optional.
   * We want to be extra-safe and always check that this exists, to ensure weird environments do not blow up.
   */
  const optionalWindowDocument = WINDOW.document ;

  const metaTag = optionalWindowDocument?.querySelector(`meta[name=${metaName}]`);
  return metaTag?.getAttribute('content') || undefined;
}

/** Start listener for interaction transactions */
function registerInteractionListener(
  client,
  idleTimeout,
  finalTimeout,
  childSpanTimeout,
  latestRoute,
) {
  /**
   * This is just a small wrapper that makes `document` optional.
   * We want to be extra-safe and always check that this exists, to ensure weird environments do not blow up.
   */
  const optionalWindowDocument = WINDOW.document ;

  let inflightInteractionSpan;
  const registerInteractionTransaction = () => {
    const op = 'ui.action.click';

    const activeIdleSpan = getActiveIdleSpan(client);
    if (activeIdleSpan) {
      const currentRootSpanOp = spanToJSON(activeIdleSpan).op;
      if (['navigation', 'pageload'].includes(currentRootSpanOp )) {
        DEBUG_BUILD &&
          debug.warn(`[Tracing] Did not create ${op} span because a pageload or navigation span is in progress.`);
        return undefined;
      }
    }

    if (inflightInteractionSpan) {
      inflightInteractionSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON, 'interactionInterrupted');
      inflightInteractionSpan.end();
      inflightInteractionSpan = undefined;
    }

    if (!latestRoute.name) {
      DEBUG_BUILD && debug.warn(`[Tracing] Did not create ${op} transaction because _latestRouteName is missing.`);
      return undefined;
    }

    inflightInteractionSpan = startIdleSpan(
      {
        name: latestRoute.name,
        op,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: latestRoute.source || 'url',
        },
      },
      {
        idleTimeout,
        finalTimeout,
        childSpanTimeout,
      },
    );
  };

  if (optionalWindowDocument) {
    addEventListener('click', registerInteractionTransaction, { capture: true });
  }
}

// We store the active idle span on the client object, so we can access it from exported functions
const ACTIVE_IDLE_SPAN_PROPERTY = '_sentry_idleSpan';
function getActiveIdleSpan(client) {
  return (client )[ACTIVE_IDLE_SPAN_PROPERTY];
}

function setActiveIdleSpan(client, span) {
  addNonEnumerableProperty(client, ACTIVE_IDLE_SPAN_PROPERTY, span);
}

// The max. time in seconds between two pageload/navigation spans that makes us consider the second one a redirect
const REDIRECT_THRESHOLD = 0.3;

function isRedirect(activeSpan, lastInteractionTimestamp) {
  const spanData = spanToJSON(activeSpan);

  const now = dateTimestampInSeconds();

  // More than 300ms since last navigation/pageload span?
  // --> never consider this a redirect
  const startTimestamp = spanData.start_timestamp;
  if (now - startTimestamp > REDIRECT_THRESHOLD) {
    return false;
  }

  // A click happened in the last 300ms?
  // --> never consider this a redirect
  if (lastInteractionTimestamp && now - lastInteractionTimestamp <= REDIRECT_THRESHOLD) {
    return false;
  }

  return true;
}

export { BROWSER_TRACING_INTEGRATION_ID, browserTracingIntegration, getMetaContent, startBrowserTracingNavigationSpan, startBrowserTracingPageLoadSpan };
//# sourceMappingURL=browserTracingIntegration.js.map
