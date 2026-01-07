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
export default function orderProperties(properties, order) {
    if (!Array.isArray(order)) {
        return properties;
    }
    const arrayToHash = (arr) => arr.reduce((prev, curr) => {
        prev[curr] = true;
        return prev;
    }, {});
    const errorPropList = (arr) => arr.length > 1 ? `properties '${arr.join("', '")}'` : `property '${arr[0]}'`;
    const propertyHash = arrayToHash(properties);
    const orderFiltered = order.filter((prop) => prop === '*' || propertyHash[prop]);
    const orderHash = arrayToHash(orderFiltered);
    const rest = properties.filter((prop) => !orderHash[prop]);
    const restIndex = orderFiltered.indexOf('*');
    if (restIndex === -1) {
        if (rest.length) {
            throw new Error(`uiSchema order list does not contain ${errorPropList(rest)}`);
        }
        return orderFiltered;
    }
    if (restIndex !== orderFiltered.lastIndexOf('*')) {
        throw new Error('uiSchema order list contains more than one wildcard item');
    }
    const complete = [...orderFiltered];
    complete.splice(restIndex, 1, ...rest);
    return complete;
}
//# sourceMappingURL=orderProperties.js.map