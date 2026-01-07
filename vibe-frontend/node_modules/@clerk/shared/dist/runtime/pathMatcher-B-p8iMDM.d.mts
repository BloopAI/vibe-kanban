import { Autocomplete } from "./index-BnRZtxqr.mjs";

//#region src/pathMatcher.d.ts
type WithPathPatternWildcard<T = string> = `${T & string}(.*)`;
type PathPattern = Autocomplete<WithPathPatternWildcard>;
type PathMatcherParam = Array<RegExp | PathPattern> | RegExp | PathPattern;
/**
 * Creates a function that matches paths against a set of patterns.
 *
 * @param patterns - A string, RegExp, or array of patterns to match against
 * @returns A function that takes a pathname and returns true if it matches any of the patterns
 */
declare const createPathMatcher: (patterns: PathMatcherParam) => (pathname: string) => boolean;
//#endregion
export { PathMatcherParam, PathPattern, WithPathPatternWildcard, createPathMatcher };
//# sourceMappingURL=pathMatcher-B-p8iMDM.d.mts.map