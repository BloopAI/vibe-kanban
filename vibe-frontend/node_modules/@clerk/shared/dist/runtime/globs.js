const require_chunk = require('./chunk-nOFOJqeH.js');
let glob_to_regexp = require("glob-to-regexp");
glob_to_regexp = require_chunk.__toESM(glob_to_regexp);

//#region src/globs.ts
const globs = { toRegexp: (pattern) => {
	try {
		return (0, glob_to_regexp.default)(pattern);
	} catch (e) {
		throw new Error(`Invalid pattern: ${pattern}.\nConsult the documentation of glob-to-regexp here: https://www.npmjs.com/package/glob-to-regexp.\n${e.message}`);
	}
} };

//#endregion
exports.globs = globs;
//# sourceMappingURL=globs.js.map