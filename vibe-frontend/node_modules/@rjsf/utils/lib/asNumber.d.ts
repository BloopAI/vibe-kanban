/** Attempts to convert the string into a number. If an empty string is provided, then `undefined` is returned. If a
 * `null` is provided, it is returned. If the string ends in a `.` then the string is returned because the user may be
 * in the middle of typing a float number. If a number ends in a pattern like `.0`, `.20`, `.030`, string is returned
 * because the user may be typing number that will end in a non-zero digit. Otherwise, the string is wrapped by
 * `Number()` and if that result is not `NaN`, that number will be returned, otherwise the string `value` will be.
 *
 * @param value - The string or null value to convert to a number
 * @returns - The `value` converted to a number when appropriate, otherwise the `value`
 */
export default function asNumber(value: string | null): string | number | null | undefined;
