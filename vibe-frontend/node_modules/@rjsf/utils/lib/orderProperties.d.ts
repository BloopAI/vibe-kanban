/** Given a list of `properties` and an `order` list, returns a list that contains the `properties` ordered correctly.
 * If `order` is not an array, then the untouched `properties` list is returned. Otherwise `properties` is ordered per
 * the `order` list. If `order` contains a '*' then any `properties` that are not mentioned explicity in `order` will be
 * places in the location of the `*`.
 *
 * @param properties - The list of property keys to be ordered
 * @param order - An array of property keys to be ordered first, with an optional '*' property
 * @returns - A list with the `properties` ordered
 * @throws - Error when the properties cannot be ordered correctly
 */
export default function orderProperties(properties: string[], order?: string[]): string[];
