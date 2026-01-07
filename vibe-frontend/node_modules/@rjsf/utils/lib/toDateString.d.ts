import { DateObject } from './types.js';
/** Returns a UTC date string for the given `dateObject`. If `time` is false, then the time portion of the string is
 * removed.
 *
 * @param dateObject - The `DateObject` to convert to a date string
 * @param [time=true] - Optional flag used to remove the time portion of the date string if false
 * @returns - The UTC date string
 */
export default function toDateString(dateObject: DateObject, time?: boolean): string;
