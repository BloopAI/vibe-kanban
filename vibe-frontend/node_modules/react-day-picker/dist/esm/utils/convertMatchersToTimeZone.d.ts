import type { Matcher } from "../types/index.js";
/**
 * Convert any {@link Matcher} or array of matchers to the specified time zone.
 *
 * @param matchers - The matcher or matchers to convert.
 * @param timeZone - The target IANA time zone.
 * @returns The converted matcher(s).
 * @group Utilities
 */
export declare function convertMatchersToTimeZone(matchers: Matcher | Matcher[] | undefined, timeZone: string, noonSafe?: boolean): Matcher | Matcher[] | undefined;
