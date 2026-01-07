/** Attempts to convert the string into a number. If an empty string is provided, then `undefined` is returned. If a
 * `null` is provided, it is returned. If the string ends in a `.` then the string is returned because the user may be
 * in the middle of typing a float number. If a number ends in a pattern like `.0`, `.20`, `.030`, string is returned
 * because the user may be typing number that will end in a non-zero digit. Otherwise, the string is wrapped by
 * `Number()` and if that result is not `NaN`, that number will be returned, otherwise the string `value` will be.
 *
 * @param value - The string or null value to convert to a number
 * @returns - The `value` converted to a number when appropriate, otherwise the `value`
 */
export default function asNumber(value: string | null) {
  if (value === '') {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (/\.$/.test(value)) {
    // '3.' can't really be considered a number even if it parses in js. The
    // user is most likely entering a float.
    return value;
  }
  if (/\.0$/.test(value)) {
    // we need to return this as a string here, to allow for input like 3.07
    return value;
  }

  if (/\.\d*0$/.test(value)) {
    // It's a number, that's cool - but we need it as a string so it doesn't screw
    // with the user when entering dollar amounts or other values (such as those with
    // specific precision or number of significant digits)
    return value;
  }

  const n = Number(value);
  const valid = typeof n === 'number' && !Number.isNaN(n);

  return valid ? n : value;
}
