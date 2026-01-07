import { TZDate } from "@date-fns/tz";
import { addDays as addDaysJalali, addMonths as addMonthsJalali, addWeeks as addWeeksJalali, addYears as addYearsJalali, differenceInCalendarDays as differenceInCalendarDaysJalali, differenceInCalendarMonths as differenceInCalendarMonthsJalali, eachMonthOfInterval as eachMonthOfIntervalJalali, eachYearOfInterval as eachYearOfIntervalJalali, endOfISOWeek as endOfISOWeekJalali, endOfMonth as endOfMonthJalali, endOfWeek as endOfWeekJalali, endOfYear as endOfYearJalali, getWeek as getWeekJalali, startOfISOWeek as startOfISOWeekJalali, startOfMonth as startOfMonthJalali, startOfWeek as startOfWeekJalali, startOfYear as startOfYearJalali, } from "date-fns-jalali";
/**
 * Jalali-aware version of {@link createNoonDateLibOverrides}.
 *
 * Keeps all calendar math at noon in the target time zone while deferring to
 * `date-fns-jalali` for calendar logic.
 */
export function createJalaliNoonOverrides(timeZone, options = {}) {
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
        return new TZDate(normalizedDate.getFullYear(), normalizedDate.getMonth(), normalizedDate.getDate(), 12, 0, 0, timeZone);
    };
    // Represent the target-zone calendar date in the host zone so date-fns-jalali
    // (which is not time-zone aware) can operate on stable wall times.
    const toCalendarDate = (date) => {
        const zoned = toNoonTZDate(date);
        return new Date(zoned.getFullYear(), zoned.getMonth(), zoned.getDate(), 12, 0, 0, 0);
    };
    return {
        today: () => toNoonTZDate(TZDate.tz(timeZone)),
        newDate: (year, monthIndex, date) => new TZDate(year, monthIndex, date, 12, 0, 0, timeZone),
        startOfDay: (date) => {
            return toNoonTZDate(date);
        },
        startOfWeek: (date, options) => {
            const weekStartsOnValue = (options?.weekStartsOn ??
                fallbackWeekStartsOn);
            const start = startOfWeekJalali(toCalendarDate(date), {
                weekStartsOn: weekStartsOnValue,
            });
            return toNoonTZDate(start);
        },
        startOfISOWeek: (date) => {
            const start = startOfISOWeekJalali(toCalendarDate(date));
            return toNoonTZDate(start);
        },
        startOfMonth: (date) => {
            const start = startOfMonthJalali(toCalendarDate(date));
            return toNoonTZDate(start);
        },
        startOfYear: (date) => {
            const start = startOfYearJalali(toCalendarDate(date));
            return toNoonTZDate(start);
        },
        endOfWeek: (date, options) => {
            const weekStartsOnValue = (options?.weekStartsOn ??
                fallbackWeekStartsOn);
            const end = endOfWeekJalali(toCalendarDate(date), {
                weekStartsOn: weekStartsOnValue,
            });
            return toNoonTZDate(end);
        },
        endOfISOWeek: (date) => {
            const end = endOfISOWeekJalali(toCalendarDate(date));
            return toNoonTZDate(end);
        },
        endOfMonth: (date) => {
            const end = endOfMonthJalali(toCalendarDate(date));
            return toNoonTZDate(end);
        },
        endOfYear: (date) => {
            const end = endOfYearJalali(toCalendarDate(date));
            return toNoonTZDate(end);
        },
        eachMonthOfInterval: (interval) => {
            return eachMonthOfIntervalJalali({
                start: toCalendarDate(interval.start),
                end: toCalendarDate(interval.end),
            }).map((date) => toNoonTZDate(date));
        },
        addDays: (date, amount) => toNoonTZDate(addDaysJalali(toCalendarDate(date), amount)),
        addWeeks: (date, amount) => toNoonTZDate(addWeeksJalali(toCalendarDate(date), amount)),
        addMonths: (date, amount) => toNoonTZDate(addMonthsJalali(toCalendarDate(date), amount)),
        addYears: (date, amount) => toNoonTZDate(addYearsJalali(toCalendarDate(date), amount)),
        eachYearOfInterval: (interval) => {
            return eachYearOfIntervalJalali({
                start: toCalendarDate(interval.start),
                end: toCalendarDate(interval.end),
            }).map((date) => toNoonTZDate(date));
        },
        getWeek: (date, options) => {
            const base = toCalendarDate(date);
            return getWeekJalali(base, {
                weekStartsOn: options?.weekStartsOn ?? fallbackWeekStartsOn,
                firstWeekContainsDate: options?.firstWeekContainsDate ??
                    locale?.options?.firstWeekContainsDate ??
                    1,
            });
        },
        differenceInCalendarDays: (dateLeft, dateRight) => {
            const left = toCalendarDate(dateLeft);
            const right = toCalendarDate(dateRight);
            return differenceInCalendarDaysJalali(left, right);
        },
        differenceInCalendarMonths: (dateLeft, dateRight) => {
            const left = toCalendarDate(dateLeft);
            const right = toCalendarDate(dateRight);
            return differenceInCalendarMonthsJalali(left, right);
        },
    };
}
