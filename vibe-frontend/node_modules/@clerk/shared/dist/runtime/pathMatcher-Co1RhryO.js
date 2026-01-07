const require_pathToRegexp = require('./pathToRegexp-DNM_UlMK.js');

//#region src/pathMatcher.ts
const precomputePathRegex = (patterns) => {
	return patterns.map((pattern) => pattern instanceof RegExp ? pattern : require_pathToRegexp.pathToRegexp(pattern));
};
/**
* Creates a function that matches paths against a set of patterns.
*
* @param patterns - A string, RegExp, or array of patterns to match against
* @returns A function that takes a pathname and returns true if it matches any of the patterns
*/
const createPathMatcher = (patterns) => {
	const matchers = precomputePathRegex([patterns || ""].flat().filter(Boolean));
	return (pathname) => matchers.some((matcher) => matcher.test(pathname));
};

//#endregion
Object.defineProperty(exports, 'createPathMatcher', {
  enumerable: true,
  get: function () {
    return createPathMatcher;
  }
});
//# sourceMappingURL=pathMatcher-Co1RhryO.js.map