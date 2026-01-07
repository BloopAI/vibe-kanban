"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createJalaliNoonOverrides = createJalaliNoonOverrides;
const tz_1 = require("@date-fns/tz");
const date_fns_jalali_1 = require("date-fns-jalali");
/**
 * Jalali-aware version of {@link createNoonDateLibOverrides}.
 *
 * Keeps all calendar math at noon in the target time zone while deferring to
 * `date-fns-jalali` for calendar logic.
 */
function createJalaliNoonOverrides(timeZone, options = {}) {
    const { weekStartsOn, locale } = options;
    const fallbackWeekStartsOn = (weekStartsOn ??
        locale?.options?.weekStartsOn ??
        6);
    // Keep all internal math anchored at noon in the target zone to avoid
    // historical second-level offsets from crossing midnight.
    const toNoonTZDate = (date) => {
        const normalizedDate = typeof date === "number" || typeof date === "string"
            ? new Date(date)
            : date;
        return new tz_1.TZDate(normalizedDate.getFullYear(), normalizedDate.getMonth(), normalizedDate.getDate(), 12, 0, 0, timeZone);
    };
    // Represent the target-zone calendar date in the host zone so date-fns-jalali
    // (which is not time-zone aware) can operate on stable wall times.
    const toCalendarDate = (date) => {
        const zoned = toNoonTZDate(date);
        return new Date(zoned.getFullYear(), zoned.getMonth(), zoned.getDate(), 12, 0, 0, 0);
    };
    return {
        today: () => toNoonTZDate(tz_1.TZDate.tz(timeZone)),
        newDate: (year, monthIndex, date) => new tz_1.TZDate(year, monthIndex, date, 12, 0, 0, timeZone),
        startOfDay: (date) => {
            return toNoonTZDate(date);
        },
        startOfWeek: (date, options) => {
            const weekStartsOnValue = (options?.weekStartsOn ??
                fallbackWeekStartsOn);
            const start = (0, date_fns_jalali_1.startOfWeek)(toCalendarDate(date), {
                weekStartsOn: weekStartsOnValue,
            });
            return toNoonTZDate(start);
        },
        startOfISOWeek: (date) => {
            const start = (0, date_fns_jalali_1.startOfISOWeek)(toCalendarDate(date));
            return toNoonTZDate(start);
        },
        startOfMonth: (date) => {
            const start = (0, date_fns_jalali_1.startOfMonth)(toCalendarDate(date));
            return toNoonTZDate(start);
        },
        startOfYear: (date) => {
            const start = (0, date_fns_jalali_1.startOfYear)(toCalendarDate(date));
            return toNoonTZDate(start);
        },
        endOfWeek: (date, options) => {
            const weekStartsOnValue = (options?.weekStartsOn ??
                fallbackWeekStartsOn);
            const end = (0, date_fns_jalali_1.endOfWeek)(toCalendarDate(date), {
                weekStartsOn: weekStartsOnValue,
            });
            return toNoonTZDate(end);
        },
        endOfISOWeek: (date) => {
            const end = (0, date_fns_jalali_1.endOfISOWeek)(toCalendarDate(date));
            return toNoonTZDate(end);
        },
        endOfMonth: (date) => {
            const end = (0, date_fns_jalali_1.endOfMonth)(toCalendarDate(date));
            return toNoonTZDate(end);
        },
        endOfYear: (date) => {
            const end = (0, date_fns_jalali_1.endOfYear)(toCalendarDate(date));
            return toNoonTZDate(end);
        },
        eachMonthOfInterval: (interval) => {
            return (0, date_fns_jalali_1.eachMonthOfInterval)({
                start: toCalendarDate(interval.start),
                end: toCalendarDate(interval.end),
            }).map((date) => toNoonTZDate(date));
        },
        addDays: (date, amount) => toNoonTZDate((0, date_fns_jalali_1.addDays)(toCalendarDate(date), amount)),
        addWeeks: (date, amount) => toNoonTZDate((0, date_fns_jalali_1.addWeeks)(toCalendarDate(date), amount)),
        addMonths: (date, amount) => toNoonTZDate((0, date_fns_jalali_1.addMonths)(toCalendarDate(date), amount)),
        addYears: (date, amount) => toNoonTZDate((0, date_fns_jalali_1.addYears)(toCalendarDate(date), amount)),
        eachYearOfInterval: (interval) => {
            return (0, date_fns_jalali_1.eachYearOfInterval)({
                start: toCalendarDate(interval.start),
                end: toCalendarDate(interval.end),
            }).map((date) => toNoonTZDate(date));
        },
        getWeek: (date, options) => {
            const base = toCalendarDate(date);
            return (0, date_fns_jalali_1.getWeek)(base, {
                weekStartsOn: options?.weekStartsOn ?? fallbackWeekStartsOn,
                firstWeekContainsDate: options?.firstWeekContainsDate ??
                    locale?.options?.firstWeekContainsDate ??
                    1,
            });
        },
        differenceInCalendarDays: (dateLeft, dateRight) => {
            const left = toCalendarDate(dateLeft);
            const right = toCalendarDate(dateRight);
            return (0, date_fns_jalali_1.differenceInCalendarDays)(left, right);
        },
        differenceInCalendarMonths: (dateLeft, dateRight) => {
            const left = toCalendarDate(dateLeft);
            const right = toCalendarDate(dateRight);
            return (0, date_fns_jalali_1.differenceInCalendarMonths)(left, right);
        },
    };
}
