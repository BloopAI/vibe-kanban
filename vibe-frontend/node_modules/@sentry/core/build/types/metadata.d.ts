import type { Event } from './types-hoist/event';
import type { StackParser } from './types-hoist/stacktrace';
/**
 * Retrieve metadata for a specific JavaScript file URL.
 *
 * Metadata is injected by the Sentry bundler plugins using the `_experiments.moduleMetadata` config option.
 */
export declare function getMetadataForUrl(parser: StackParser, filename: string): any | undefined;
/**
 * Adds metadata to stack frames.
 *
 * Metadata is injected by the Sentry bundler plugins using the `_experiments.moduleMetadata` config option.
 */
export declare function addMetadataToStackFrames(parser: StackParser, event: Event): void;
/**
 * Strips metadata from stack frames.
 */
export declare function stripMetadataFromStackFrames(event: Event): void;
//# sourceMappingURL=metadata.d.ts.map