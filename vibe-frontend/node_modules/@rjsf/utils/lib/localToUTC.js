/** Converts a local Date string into a UTC date string
 *
 * @param dateString - The string representation of a date as accepted by the `Date()` constructor
 * @returns - A UTC date string if `dateString` is truthy, otherwise undefined
 */
export default function localToUTC(dateString) {
    return dateString ? new Date(dateString).toJSON() : undefined;
}
//# sourceMappingURL=localToUTC.js.map