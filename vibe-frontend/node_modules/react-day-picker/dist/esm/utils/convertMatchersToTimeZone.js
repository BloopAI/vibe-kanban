import { TZDate } from "@date-fns/tz";
import { toTimeZone } from "./toTimeZone.js";
import { isDateAfterType, isDateBeforeType, isDateInterval, isDateRange, } from "./typeguards.js";
function toZoneNoon(date, timeZone, noonSafe) {
    if (!noonSafe)
        return toTimeZone(date, timeZone);
    const zoned = toTimeZone(date, timeZone);
    const noonZoned = new TZDate(zoned.getFullYear(), zoned.getMonth(), zoned.getDate(), 12, 0, 0, timeZone);
    return new Date(noonZoned.getTime());
}
function convertMatcher(matcher, timeZone, noonSafe) {
    if (typeof matcher === "boolean" || typeof matcher === "function") {
        return matcher;
    }
    if (matcher instanceof Date) {
        return toZoneNoon(matcher, timeZone, noonSafe);
    }
    if (Array.isArray(matcher)) {
        return matcher.map((value) => value instanceof Date ? toZoneNoon(value, timeZone, noonSafe) : value);
    }
    if (isDateRange(matcher)) {
        return {
            ...matcher,
            from: matcher.from ? toTimeZone(matcher.from, timeZone) : matcher.from,
            to: matcher.to ? toTimeZone(matcher.to, timeZone) : matcher.to,
        };
    }
    if (isDateInterval(matcher)) {
        return {
            before: toZoneNoon(matcher.before, timeZone, noonSafe),
            after: toZoneNoon(matcher.after, timeZone, noonSafe),
        };
    }
    if (isDateAfterType(matcher)) {
        return {
            after: toZoneNoon(matcher.after, timeZone, noonSafe),
        };
    }
    if (isDateBeforeType(matcher)) {
        return {
            before: toZoneNoon(matcher.before, timeZone, noonSafe),
        };
    }
    return matcher;
}
/**
 * Convert any {@link Matcher} or array of matchers to the specified time zone.
 *
 * @param matchers - The matcher or matchers to convert.
 * @param timeZone - The target IANA time zone.
 * @returns The converted matcher(s).
 * @group Utilities
 */
export function convertMatchersToTimeZone(matchers, timeZone, noonSafe) {
    if (!matchers) {
        return matchers;
    }
    if (Array.isArray(matchers)) {
        return matchers.map((matcher) => convertMatcher(matcher, timeZone, noonSafe));
    }
    return convertMatcher(matchers, timeZone, noonSafe);
}
