import { DateObject } from './types.js';
/** Parses the `dateString` into a `DateObject`, including the time information when `includeTime` is true
 *
 * @param dateString - The date string to parse into a DateObject
 * @param [includeTime=true] - Optional flag, if false, will not include the time data into the object
 * @returns - The date string converted to a `DateObject`
 * @throws - Error when the date cannot be parsed from the string
 */
export default function parseDateString(dateString?: string, includeTime?: boolean): DateObject;
