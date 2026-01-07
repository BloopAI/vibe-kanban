Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

/**
 * Transforms a `Headers` object that implements the `Web Fetch API` (https://developer.mozilla.org/en-US/docs/Web/API/Headers) into a simple key-value dict.
 * The header keys will be lower case: e.g. A "Content-Type" header will be stored as "content-type".
 */
function winterCGHeadersToDict(winterCGHeaders) {
  const headers = {};
  try {
    winterCGHeaders.forEach((value, key) => {
      if (typeof value === 'string') {
        // We check that value is a string even though it might be redundant to make sure prototype pollution is not possible.
        headers[key] = value;
      }
    });
  } catch {
    // just return the empty headers
  }

  return headers;
}

/**
 * Convert common request headers to a simple dictionary.
 */
function headersToDict(reqHeaders) {
  const headers = Object.create(null);

  try {
    Object.entries(reqHeaders).forEach(([key, value]) => {
      if (typeof value === 'string') {
        headers[key] = value;
      }
    });
  } catch {
    // just return the empty headers
  }

  return headers;
}

/**
 * Converts a `Request` object that implements the `Web Fetch API` (https://developer.mozilla.org/en-US/docs/Web/API/Headers) into the format that the `RequestData` integration understands.
 */
function winterCGRequestToRequestData(req) {
  const headers = winterCGHeadersToDict(req.headers);

  return {
    method: req.method,
    url: req.url,
    query_string: extractQueryParamsFromUrl(req.url),
    headers,
    // TODO: Can we extract body data from the request?
  };
}

/**
 * Convert a HTTP request object to RequestEventData to be passed as normalizedRequest.
 * Instead of allowing `PolymorphicRequest` to be passed,
 * we want to be more specific and generally require a http.IncomingMessage-like object.
 */
function httpRequestToRequestData(request

) {
  const headers = request.headers || {};

  // Check for x-forwarded-host first, then fall back to host header
  const forwardedHost = typeof headers['x-forwarded-host'] === 'string' ? headers['x-forwarded-host'] : undefined;
  const host = forwardedHost || (typeof headers.host === 'string' ? headers.host : undefined);

  // Check for x-forwarded-proto first, then fall back to existing protocol detection
  const forwardedProto = typeof headers['x-forwarded-proto'] === 'string' ? headers['x-forwarded-proto'] : undefined;
  const protocol = forwardedProto || request.protocol || (request.socket?.encrypted ? 'https' : 'http');

  const url = request.url || '';

  const absoluteUrl = getAbsoluteUrl({
    url,
    host,
    protocol,
  });

  // This is non-standard, but may be sometimes set
  // It may be overwritten later by our own body handling
  const data = (request ).body || undefined;

  // This is non-standard, but may be set on e.g. Next.js or Express requests
  const cookies = (request ).cookies;

  return {
    url: absoluteUrl,
    method: request.method,
    query_string: extractQueryParamsFromUrl(url),
    headers: headersToDict(headers),
    cookies,
    data,
  };
}

function getAbsoluteUrl({
  url,
  protocol,
  host,
}

) {
  if (url?.startsWith('http')) {
    return url;
  }

  if (url && host) {
    return `${protocol}://${host}${url}`;
  }

  return undefined;
}

/** Extract the query params from an URL. */
function extractQueryParamsFromUrl(url) {
  // url is path and query string
  if (!url) {
    return;
  }

  try {
    // The `URL` constructor can't handle internal URLs of the form `/some/path/here`, so stick a dummy protocol and
    // hostname as the base. Since the point here is just to grab the query string, it doesn't matter what we use.
    const queryParams = new URL(url, 'http://s.io').search.slice(1);
    return queryParams.length ? queryParams : undefined;
  } catch {
    return undefined;
  }
}

exports.extractQueryParamsFromUrl = extractQueryParamsFromUrl;
exports.headersToDict = headersToDict;
exports.httpRequestToRequestData = httpRequestToRequestData;
exports.winterCGHeadersToDict = winterCGHeadersToDict;
exports.winterCGRequestToRequestData = winterCGRequestToRequestData;
//# sourceMappingURL=request.js.map
