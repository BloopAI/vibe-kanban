Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const baggage = require('./baggage.js');
const parseSampleRate = require('./parseSampleRate.js');
const propagationContext = require('./propagationContext.js');

// eslint-disable-next-line @sentry-internal/sdk/no-regexp-constructor -- RegExp is used for readability here
const TRACEPARENT_REGEXP = new RegExp(
  '^[ \\t]*' + // whitespace
    '([0-9a-f]{32})?' + // trace_id
    '-?([0-9a-f]{16})?' + // span_id
    '-?([01])?' + // sampled
    '[ \\t]*$', // whitespace
);

/**
 * Extract transaction context data from a `sentry-trace` header.
 *
 * @param traceparent Traceparent string
 *
 * @returns Object containing data from the header, or undefined if traceparent string is malformed
 */
function extractTraceparentData(traceparent) {
  if (!traceparent) {
    return undefined;
  }

  const matches = traceparent.match(TRACEPARENT_REGEXP);
  if (!matches) {
    return undefined;
  }

  let parentSampled;
  if (matches[3] === '1') {
    parentSampled = true;
  } else if (matches[3] === '0') {
    parentSampled = false;
  }

  return {
    traceId: matches[1],
    parentSampled,
    parentSpanId: matches[2],
  };
}

/**
 * Create a propagation context from incoming headers or
 * creates a minimal new one if the headers are undefined.
 */
function propagationContextFromHeaders(
  sentryTrace,
  baggage$1,
) {
  const traceparentData = extractTraceparentData(sentryTrace);
  const dynamicSamplingContext = baggage.baggageHeaderToDynamicSamplingContext(baggage$1);

  if (!traceparentData?.traceId) {
    return {
      traceId: propagationContext.generateTraceId(),
      sampleRand: Math.random(),
    };
  }

  const sampleRand = getSampleRandFromTraceparentAndDsc(traceparentData, dynamicSamplingContext);

  // The sample_rand on the DSC needs to be generated based on traceparent + baggage.
  if (dynamicSamplingContext) {
    dynamicSamplingContext.sample_rand = sampleRand.toString();
  }

  const { traceId, parentSpanId, parentSampled } = traceparentData;

  return {
    traceId,
    parentSpanId,
    sampled: parentSampled,
    dsc: dynamicSamplingContext || {}, // If we have traceparent data but no DSC it means we are not head of trace and we must freeze it
    sampleRand,
  };
}

/**
 * Create sentry-trace header from span context values.
 */
function generateSentryTraceHeader(
  traceId = propagationContext.generateTraceId(),
  spanId = propagationContext.generateSpanId(),
  sampled,
) {
  let sampledString = '';
  if (sampled !== undefined) {
    sampledString = sampled ? '-1' : '-0';
  }
  return `${traceId}-${spanId}${sampledString}`;
}

/**
 * Given any combination of an incoming trace, generate a sample rand based on its defined semantics.
 *
 * Read more: https://develop.sentry.dev/sdk/telemetry/traces/#propagated-random-value
 */
function getSampleRandFromTraceparentAndDsc(
  traceparentData,
  dsc,
) {
  // When there is an incoming sample rand use it.
  const parsedSampleRand = parseSampleRate.parseSampleRate(dsc?.sample_rand);
  if (parsedSampleRand !== undefined) {
    return parsedSampleRand;
  }

  // Otherwise, if there is an incoming sampling decision + sample rate, generate a sample rand that would lead to the same sampling decision.
  const parsedSampleRate = parseSampleRate.parseSampleRate(dsc?.sample_rate);
  if (parsedSampleRate && traceparentData?.parentSampled !== undefined) {
    return traceparentData.parentSampled
      ? // Returns a sample rand with positive sampling decision [0, sampleRate)
        Math.random() * parsedSampleRate
      : // Returns a sample rand with negative sampling decision [sampleRate, 1)
        parsedSampleRate + Math.random() * (1 - parsedSampleRate);
  } else {
    // If nothing applies, return a random sample rand.
    return Math.random();
  }
}

exports.TRACEPARENT_REGEXP = TRACEPARENT_REGEXP;
exports.extractTraceparentData = extractTraceparentData;
exports.generateSentryTraceHeader = generateSentryTraceHeader;
exports.propagationContextFromHeaders = propagationContextFromHeaders;
//# sourceMappingURL=tracing.js.map
