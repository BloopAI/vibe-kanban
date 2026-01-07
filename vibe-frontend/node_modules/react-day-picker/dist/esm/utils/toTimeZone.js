import { TZDate } from "@date-fns/tz";
/**
 * Convert a {@link Date} or {@link TZDate} instance to the given time zone.
 * Reuses the same instance when it is already a {@link TZDate} using the target
 * time zone to avoid extra allocations.
 */
export function toTimeZone(date, timeZone) {
    if (date instanceof TZDate && date.timeZone === timeZone) {
        return date;
    }
    return new TZDate(date, timeZone);
}
