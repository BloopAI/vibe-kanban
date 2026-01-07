import { debug } from '@sentry/core';
import { DEBUG_BUILD } from './debug-build.js';

/**
 * Serializes FormData.
 *
 * This is a bit simplified, but gives us a decent estimate.
 * This converts e.g. { name: 'Anne Smith', age: 13 } to 'name=Anne+Smith&age=13'.
 *
 */
function serializeFormData(formData) {
  // @ts-expect-error passing FormData to URLSearchParams actually works
  return new URLSearchParams(formData).toString();
}

/** Get the string representation of a body. */
function getBodyString(body, _debug = debug) {
  try {
    if (typeof body === 'string') {
      return [body];
    }

    if (body instanceof URLSearchParams) {
      return [body.toString()];
    }

    if (body instanceof FormData) {
      return [serializeFormData(body)];
    }

    if (!body) {
      return [undefined];
    }
  } catch (error) {
    DEBUG_BUILD && _debug.error(error, 'Failed to serialize body', body);
    return [undefined, 'BODY_PARSE_ERROR'];
  }

  DEBUG_BUILD && _debug.log('Skipping network body because of body type', body);

  return [undefined, 'UNPARSEABLE_BODY_TYPE'];
}

/**
 * Parses the fetch arguments to extract the request payload.
 *
 * We only support getting the body from the fetch options.
 */
function getFetchRequestArgBody(fetchArgs = []) {
  if (fetchArgs.length !== 2 || typeof fetchArgs[1] !== 'object') {
    return undefined;
  }

  return (fetchArgs[1] ).body;
}

export { getBodyString, getFetchRequestArgBody, serializeFormData };
//# sourceMappingURL=networkUtils.js.map
