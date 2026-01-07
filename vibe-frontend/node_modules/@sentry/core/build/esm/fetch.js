import { getClient } from './currentScopes.js';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from './semanticAttributes.js';
import { getActiveSpan } from './utils/spanUtils.js';
import { setHttpStatus, SPAN_STATUS_ERROR } from './tracing/spanstatus.js';
import { isRequest, isInstanceOf } from './utils/is.js';
import { hasSpansEnabled } from './utils/hasSpansEnabled.js';
import { SENTRY_BAGGAGE_KEY_PREFIX } from './utils/baggage.js';
import { SentryNonRecordingSpan } from './tracing/sentryNonRecordingSpan.js';
import { startInactiveSpan } from './tracing/trace.js';
import { getTraceData } from './utils/traceData.js';
import { parseStringToURLObject, getSanitizedUrlStringFromUrlObject, isURLObjectRelative } from './utils/url.js';

/**
 * Create and track fetch request spans for usage in combination with `addFetchInstrumentationHandler`.
 *
 * @returns Span if a span was created, otherwise void.
 */
function instrumentFetchRequest(
  handlerData,
  shouldCreateSpan,
  shouldAttachHeaders,
  spans,
  spanOrigin = 'auto.http.browser',
) {
  if (!handlerData.fetchData) {
    return undefined;
  }

  const { method, url } = handlerData.fetchData;

  const shouldCreateSpanResult = hasSpansEnabled() && shouldCreateSpan(url);

  if (handlerData.endTimestamp && shouldCreateSpanResult) {
    const spanId = handlerData.fetchData.__span;
    if (!spanId) return;

    const span = spans[spanId];
    if (span) {
      endSpan(span, handlerData);

      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete spans[spanId];
    }
    return undefined;
  }

  const hasParent = !!getActiveSpan();

  const span =
    shouldCreateSpanResult && hasParent
      ? startInactiveSpan(getSpanStartOptions(url, method, spanOrigin))
      : new SentryNonRecordingSpan();

  handlerData.fetchData.__span = span.spanContext().spanId;
  spans[span.spanContext().spanId] = span;

  if (shouldAttachHeaders(handlerData.fetchData.url)) {
    const request = handlerData.args[0];

    const options = handlerData.args[1] || {};

    const headers = _addTracingHeadersToFetchRequest(
      request,
      options,
      // If performance is disabled (TWP) or there's no active root span (pageload/navigation/interaction),
      // we do not want to use the span as base for the trace headers,
      // which means that the headers will be generated from the scope and the sampling decision is deferred
      hasSpansEnabled() && hasParent ? span : undefined,
    );
    if (headers) {
      // Ensure this is actually set, if no options have been passed previously
      handlerData.args[1] = options;
      options.headers = headers;
    }
  }

  const client = getClient();

  if (client) {
    const fetchHint = {
      input: handlerData.args,
      response: handlerData.response,
      startTimestamp: handlerData.startTimestamp,
      endTimestamp: handlerData.endTimestamp,
    } ;

    client.emit('beforeOutgoingRequestSpan', span, fetchHint);
  }

  return span;
}

/**
 * Adds sentry-trace and baggage headers to the various forms of fetch headers.
 * exported only for testing purposes
 *
 * When we determine if we should add a baggage header, there are 3 cases:
 * 1. No previous baggage header -> add baggage
 * 2. Previous baggage header has no sentry baggage values -> add our baggage
 * 3. Previous baggage header has sentry baggage values -> do nothing (might have been added manually by users)
 */
// eslint-disable-next-line complexity -- yup it's this complicated :(
function _addTracingHeadersToFetchRequest(
  request,
  fetchOptionsObj

,
  span,
) {
  const traceHeaders = getTraceData({ span });
  const sentryTrace = traceHeaders['sentry-trace'];
  const baggage = traceHeaders.baggage;

  // Nothing to do, when we return undefined here, the original headers will be used
  if (!sentryTrace) {
    return undefined;
  }

  const originalHeaders = fetchOptionsObj.headers || (isRequest(request) ? request.headers : undefined);

  if (!originalHeaders) {
    return { ...traceHeaders };
  } else if (isHeaders(originalHeaders)) {
    const newHeaders = new Headers(originalHeaders);

    // We don't want to override manually added sentry headers
    if (!newHeaders.get('sentry-trace')) {
      newHeaders.set('sentry-trace', sentryTrace);
    }

    if (baggage) {
      const prevBaggageHeader = newHeaders.get('baggage');

      if (!prevBaggageHeader) {
        newHeaders.set('baggage', baggage);
      } else if (!baggageHeaderHasSentryBaggageValues(prevBaggageHeader)) {
        newHeaders.set('baggage', `${prevBaggageHeader},${baggage}`);
      }
    }

    return newHeaders;
  } else if (Array.isArray(originalHeaders)) {
    const newHeaders = [...originalHeaders];

    if (!originalHeaders.find(header => header[0] === 'sentry-trace')) {
      newHeaders.push(['sentry-trace', sentryTrace]);
    }

    const prevBaggageHeaderWithSentryValues = originalHeaders.find(
      header => header[0] === 'baggage' && baggageHeaderHasSentryBaggageValues(header[1]),
    );

    if (baggage && !prevBaggageHeaderWithSentryValues) {
      // If there are multiple entries with the same key, the browser will merge the values into a single request header.
      // Its therefore safe to simply push a "baggage" entry, even though there might already be another baggage header.
      newHeaders.push(['baggage', baggage]);
    }

    return newHeaders ;
  } else {
    const existingSentryTraceHeader = 'sentry-trace' in originalHeaders ? originalHeaders['sentry-trace'] : undefined;

    const existingBaggageHeader = 'baggage' in originalHeaders ? originalHeaders.baggage : undefined;
    const newBaggageHeaders = existingBaggageHeader
      ? Array.isArray(existingBaggageHeader)
        ? [...existingBaggageHeader]
        : [existingBaggageHeader]
      : [];

    const prevBaggageHeaderWithSentryValues =
      existingBaggageHeader &&
      (Array.isArray(existingBaggageHeader)
        ? existingBaggageHeader.find(headerItem => baggageHeaderHasSentryBaggageValues(headerItem))
        : baggageHeaderHasSentryBaggageValues(existingBaggageHeader));

    if (baggage && !prevBaggageHeaderWithSentryValues) {
      newBaggageHeaders.push(baggage);
    }

    return {
      ...(originalHeaders ),
      'sentry-trace': (existingSentryTraceHeader ) ?? sentryTrace,
      baggage: newBaggageHeaders.length > 0 ? newBaggageHeaders.join(',') : undefined,
    };
  }
}

function endSpan(span, handlerData) {
  if (handlerData.response) {
    setHttpStatus(span, handlerData.response.status);

    const contentLength = handlerData.response?.headers?.get('content-length');

    if (contentLength) {
      const contentLengthNum = parseInt(contentLength);
      if (contentLengthNum > 0) {
        span.setAttribute('http.response_content_length', contentLengthNum);
      }
    }
  } else if (handlerData.error) {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
  }
  span.end();
}

function baggageHeaderHasSentryBaggageValues(baggageHeader) {
  return baggageHeader.split(',').some(baggageEntry => baggageEntry.trim().startsWith(SENTRY_BAGGAGE_KEY_PREFIX));
}

function isHeaders(headers) {
  return typeof Headers !== 'undefined' && isInstanceOf(headers, Headers);
}

function getSpanStartOptions(
  url,
  method,
  spanOrigin,
) {
  const parsedUrl = parseStringToURLObject(url);
  return {
    name: parsedUrl ? `${method} ${getSanitizedUrlStringFromUrlObject(parsedUrl)}` : method,
    attributes: getFetchSpanAttributes(url, parsedUrl, method, spanOrigin),
  };
}

function getFetchSpanAttributes(
  url,
  parsedUrl,
  method,
  spanOrigin,
) {
  const attributes = {
    url,
    type: 'fetch',
    'http.method': method,
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: spanOrigin,
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.client',
  };
  if (parsedUrl) {
    if (!isURLObjectRelative(parsedUrl)) {
      attributes['http.url'] = parsedUrl.href;
      attributes['server.address'] = parsedUrl.host;
    }
    if (parsedUrl.search) {
      attributes['http.query'] = parsedUrl.search;
    }
    if (parsedUrl.hash) {
      attributes['http.fragment'] = parsedUrl.hash;
    }
  }
  return attributes;
}

export { _addTracingHeadersToFetchRequest, instrumentFetchRequest };
//# sourceMappingURL=fetch.js.map
