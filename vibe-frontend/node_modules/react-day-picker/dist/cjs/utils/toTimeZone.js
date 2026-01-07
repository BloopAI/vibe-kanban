"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toTimeZone = toTimeZone;
const tz_1 = require("@date-fns/tz");
/**
 * Convert a {@link Date} or {@link TZDate} instance to the given time zone.
 * Reuses the same instance when it is already a {@link TZDate} using the target
 * time zone to avoid extra allocations.
 */
function toTimeZone(date, timeZone) {
    if (date instanceof tz_1.TZDate && date.timeZone === timeZone) {
        return date;
    }
    return new tz_1.TZDate(date, timeZone);
}
