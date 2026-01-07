import { Options } from '../types-hoist/options';
/**
 * Determines if span recording is currently enabled.
 *
 * Spans are recorded when at least one of `tracesSampleRate` and `tracesSampler`
 * is defined in the SDK config. This function does not make any assumption about
 * sampling decisions, it only checks if the SDK is configured to record spans.
 *
 * Important: This function only determines if span recording is enabled. Trace
 * continuation and propagation is separately controlled and not covered by this function.
 * If this function returns `false`, traces can still be propagated (which is what
 * we refer to by "Tracing without Performance")
 * @see https://develop.sentry.dev/sdk/telemetry/traces/tracing-without-performance/
 *
 * @param maybeOptions An SDK options object to be passed to this function.
 * If this option is not provided, the function will use the current client's options.
 */
export declare function hasSpansEnabled(maybeOptions?: Pick<Options, 'tracesSampleRate' | 'tracesSampler'> | undefined): boolean;
/**
 * @see JSDoc of `hasSpansEnabled`
 * @deprecated Use `hasSpansEnabled` instead, which is a more accurately named version of this function.
 * This function will be removed in the next major version of the SDK.
 */
export declare const hasTracingEnabled: typeof hasSpansEnabled;
//# sourceMappingURL=hasSpansEnabled.d.ts.map
