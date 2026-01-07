"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertMatchersToTimeZone = convertMatchersToTimeZone;
const tz_1 = require("@date-fns/tz");
const toTimeZone_js_1 = require("./toTimeZone.js");
const typeguards_js_1 = require("./typeguards.js");
function toZoneNoon(date, timeZone, noonSafe) {
    if (!noonSafe)
        return (0, toTimeZone_js_1.toTimeZone)(date, timeZone);
    const zoned = (0, toTimeZone_js_1.toTimeZone)(date, timeZone);
    const noonZoned = new tz_1.TZDate(zoned.getFullYear(), zoned.getMonth(), zoned.getDate(), 12, 0, 0, timeZone);
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
    if ((0, typeguards_js_1.isDateRange)(matcher)) {
        return {
            ...matcher,
            from: matcher.from ? (0, toTimeZone_js_1.toTimeZone)(matcher.from, timeZone) : matcher.from,
            to: matcher.to ? (0, toTimeZone_js_1.toTimeZone)(matcher.to, timeZone) : matcher.to,
        };
    }
    if ((0, typeguards_js_1.isDateInterval)(matcher)) {
        return {
            before: toZoneNoon(matcher.before, timeZone, noonSafe),
            after: toZoneNoon(matcher.after, timeZone, noonSafe),
        };
    }
    if ((0, typeguards_js_1.isDateAfterType)(matcher)) {
        return {
            after: toZoneNoon(matcher.after, timeZone, noonSafe),
        };
    }
    if ((0, typeguards_js_1.isDateBeforeType)(matcher)) {
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
function convertMatchersToTimeZone(matchers, timeZone, noonSafe) {
    if (!matchers) {
        return matchers;
    }
    if (Array.isArray(matchers)) {
        return matchers.map((matcher) => convertMatcher(matcher, timeZone, noonSafe));
    }
    return convertMatcher(matchers, timeZone, noonSafe);
}
