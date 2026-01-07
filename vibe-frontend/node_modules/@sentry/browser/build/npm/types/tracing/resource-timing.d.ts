import type { Span } from '@sentry/core';
/**
 * Converts a PerformanceResourceTiming entry to span data for the resource span.
 *
 * @param resourceTiming
 * @returns An array where the first element is the attribute name and the second element is the attribute value.
 */
export declare function resourceTimingToSpanAttributes(resourceTiming: PerformanceResourceTiming): Array<Parameters<Span['setAttribute']>>;
//# sourceMappingURL=resource-timing.d.ts.map