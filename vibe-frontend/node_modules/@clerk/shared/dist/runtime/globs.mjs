import globToRegexp from "glob-to-regexp";

//#region src/globs.ts
const globs = { toRegexp: (pattern) => {
	try {
		return globToRegexp(pattern);
	} catch (e) {
		throw new Error(`Invalid pattern: ${pattern}.\nConsult the documentation of glob-to-regexp here: https://www.npmjs.com/package/glob-to-regexp.\n${e.message}`);
	}
} };

//#endregion
export { globs };
//# sourceMappingURL=globs.mjs.map