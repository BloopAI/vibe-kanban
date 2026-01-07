/**
 * Convert camelCase to dash-case properties.
 */
const camelToDash = (str) => str.replace(/([a-z])([A-Z])/gu, "$1-$2").toLowerCase();

export { camelToDash };
//# sourceMappingURL=camel-to-dash.mjs.map
