import { TZDate } from "@date-fns/tz";
import { differenceInCalendarDays as differenceInCalendarDaysFn, differenceInCalendarMonths as differenceInCalendarMonthsFn, getISOWeek as getISOWeekFn, getWeek as getWeekFn, } from "date-fns";
/**
 * Creates `dateLib` overrides that keep all calendar math at noon in the target
 * time zone. This avoids second-level offset changes (e.g., historical zones
 * with +03:41:12) from pushing dates backward across midnight.
 */
export function createNoonOverrides(timeZone, options = {}) {
    const { weekStartsOn, locale } = options;
    const fallbackWeekStartsOn = (weekStartsOn ??
        locale?.options?.weekStartsOn ??
        0);
    // Keep all internal math anchored at noon in the target zone to avoid
    // historical second-level offsets from crossing midnight.
    const toNoonTZDate = (date) => {
        const normalizedDate = typeof date === "number" || typeof date === "string"
            ? new Date(date)
            : date;
        return new TZDate(normalizedDate.getFullYear(), normalizedDate.getMonth(), normalizedDate.getDate(), 12, 0, 0, timeZone);
    };
    // Convert a value into a host `Date` that represents the same calendar day
    // as the target-zone noon. This is useful for helpers (e.g., date-fns week
    // utilities) that expect local `Date` instances rather than `TZDate`s.
    const toCalendarDate = (date) => {
        const zoned = toNoonTZDate(date);
        return new Date(zoned.getFullYear(), zoned.getMonth(), zoned.getDate(), 0, 0, 0, 0);
    };
    return {
        today: () => {
            return toNoonTZDate(TZDate.tz(timeZone));
        },
        newDate: (year, monthIndex, date) => {
            return new TZDate(year, monthIndex, date, 12, 0, 0, timeZone);
        },
        startOfDay: (date) => {
            return toNoonTZDate(date);
        },
        startOfWeek: (date, options) => {
            const base = toNoonTZDate(date);
            const weekStartsOnValue = (options?.weekStartsOn ??
                fallbackWeekStartsOn);
            const diff = (base.getDay() - weekStartsOnValue + 7) % 7;
            base.setDate(base.getDate() - diff);
            return base;
        },
        startOfISOWeek: (date) => {
            const base = toNoonTZDate(date);
            const diff = (base.getDay() - 1 + 7) % 7;
            base.setDate(base.getDate() - diff);
            return base;
        },
        startOfMonth: (date) => {
            const base = toNoonTZDate(date);
            base.setDate(1);
            return base;
        },
        startOfYear: (date) => {
            const base = toNoonTZDate(date);
            base.setMonth(0, 1);
            return base;
        },
        endOfWeek: (date, options) => {
            const base = toNoonTZDate(date);
            const weekStartsOnValue = (options?.weekStartsOn ??
                fallbackWeekStartsOn);
            const endDow = (weekStartsOnValue + 6) % 7;
            const diff = (endDow - base.getDay() + 7) % 7;
            base.setDate(base.getDate() + diff);
            return base;
        },
        endOfISOWeek: (date) => {
            const base = toNoonTZDate(date);
            const diff = (7 - base.getDay()) % 7;
            base.setDate(base.getDate() + diff);
            return base;
        },
        endOfMonth: (date) => {
            const base = toNoonTZDate(date);
            base.setMonth(base.getMonth() + 1, 0);
            return base;
        },
        endOfYear: (date) => {
            const base = toNoonTZDate(date);
            base.setMonth(11, 31);
            return base;
        },
        eachMonthOfInterval: (interval) => {
            const start = toNoonTZDate(interval.start);
            const end = toNoonTZDate(interval.end);
            const result = [];
            const cursor = new TZDate(start.getFullYear(), start.getMonth(), 1, 12, 0, 0, timeZone);
            const endKey = end.getFullYear() * 12 + end.getMonth();
            while (cursor.getFullYear() * 12 + cursor.getMonth() <= endKey) {
                result.push(new TZDate(cursor, timeZone));
                cursor.setMonth(cursor.getMonth() + 1, 1);
            }
            return result;
        },
        // Normalize to noon once before arithmetic (avoid DST/midnight edge cases),
        // mutate the same TZDate, and return it.
        addDays: (date, amount) => {
            const base = toNoonTZDate(date);
            base.setDate(base.getDate() + amount);
            return base;
        },
        addWeeks: (date, amount) => {
            const base = toNoonTZDate(date);
            base.setDate(base.getDate() + amount * 7);
            return base;
        },
        addMonths: (date, amount) => {
            const base = toNoonTZDate(date);
            base.setMonth(base.getMonth() + amount);
            return base;
        },
        addYears: (date, amount) => {
            const base = toNoonTZDate(date);
            base.setFullYear(base.getFullYear() + amount);
            return base;
        },
        eachYearOfInterval: (interval) => {
            const start = toNoonTZDate(interval.start);
            const end = toNoonTZDate(interval.end);
            const years = [];
            const cursor = new TZDate(start.getFullYear(), 0, 1, 12, 0, 0, timeZone);
            while (cursor.getFullYear() <= end.getFullYear()) {
                years.push(new TZDate(cursor, timeZone));
                cursor.setFullYear(cursor.getFullYear() + 1, 0, 1);
            }
            return years;
        },
        getWeek: (date, options) => {
            const base = toCalendarDate(date);
            return getWeekFn(base, {
                weekStartsOn: options?.weekStartsOn ?? fallbackWeekStartsOn,
                firstWeekContainsDate: options?.firstWeekContainsDate ??
                    locale?.options?.firstWeekContainsDate ??
                    1,
            });
        },
        getISOWeek: (date) => {
            const base = toCalendarDate(date);
            return getISOWeekFn(base);
        },
        differenceInCalendarDays: (dateLeft, dateRight) => {
            const left = toCalendarDate(dateLeft);
            const right = toCalendarDate(dateRight);
            return differenceInCalendarDaysFn(left, right);
        },
        differenceInCalendarMonths: (dateLeft, dateRight) => {
            const left = toCalendarDate(dateLeft);
            const right = toCalendarDate(dateRight);
            return differenceInCalendarMonthsFn(left, right);
        },
    };
}
