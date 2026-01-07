import { PropagationContext } from '../types-hoist/tracing';
import { TraceparentData } from '../types-hoist/transaction';
export declare const TRACEPARENT_REGEXP: RegExp;
/**
 * Extract transaction context data from a `sentry-trace` header.
 *
 * @param traceparent Traceparent string
 *
 * @returns Object containing data from the header, or undefined if traceparent string is malformed
 */
export declare function extractTraceparentData(traceparent?: string): TraceparentData | undefined;
/**
 * Create a propagation context from incoming headers or
 * creates a minimal new one if the headers are undefined.
 */
export declare function propagationContextFromHeaders(sentryTrace: string | undefined, baggage: string | number | boolean | string[] | null | undefined): PropagationContext;
/**
 * Create sentry-trace header from span context values.
 */
export declare function generateSentryTraceHeader(traceId?: string | undefined, spanId?: string | undefined, sampled?: boolean): string;
//# sourceMappingURL=tracing.d.ts.map
