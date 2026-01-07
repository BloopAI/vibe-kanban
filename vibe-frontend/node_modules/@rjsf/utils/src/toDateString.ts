import { DateObject } from './types';

/** Returns a UTC date string for the given `dateObject`. If `time` is false, then the time portion of the string is
 * removed.
 *
 * @param dateObject - The `DateObject` to convert to a date string
 * @param [time=true] - Optional flag used to remove the time portion of the date string if false
 * @returns - The UTC date string
 */
export default function toDateString(dateObject: DateObject, time = true) {
  const { year, month, day, hour = 0, minute = 0, second = 0 } = dateObject;
  const utcTime = Date.UTC(year, month - 1, day, hour, minute, second);
  const datetime = new Date(utcTime).toJSON();
  return time ? datetime : datetime.slice(0, 10);
}
