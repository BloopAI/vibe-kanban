import { EnumOptionsType, RJSFSchema, StrictRJSFSchema } from './types.js';
/** Returns a list of options for a date range between `start` and `stop`. If the start date is greater than the end
 * date, then the date range is reversed. If `start` and `stop` are negative numbers (or zero), then they will be
 * treated as relative to the current year.
 *
 * @param start - The starting point of the date range
 * @param stop - The ending point of the date range
 * @returns - The list of EnumOptionsType for the date range between `start` and `stop`
 * @throws - Error when `start` and `stop` aren't both <= 0 or > 0
 */
export default function dateRangeOptions<S extends StrictRJSFSchema = RJSFSchema>(start: number, stop: number): EnumOptionsType<S>[];
