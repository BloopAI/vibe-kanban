const require_runtimeEnvironment = require('./runtimeEnvironment-MfBG-86q.js');

//#region src/utils/allSettled.ts
/**
* A ES6 compatible utility that implements `Promise.allSettled`
* @internal
*/
function allSettled(iterable) {
	const promises = Array.from(iterable).map((p) => p.then((value) => ({
		status: "fulfilled",
		value
	}), (reason) => ({
		status: "rejected",
		reason
	})));
	return Promise.all(promises);
}

//#endregion
//#region src/utils/logErrorInDevMode.ts
const logErrorInDevMode = (message) => {
	if (require_runtimeEnvironment.isDevelopmentEnvironment()) console.error(`Clerk: ${message}`);
};

//#endregion
//#region src/utils/fastDeepMerge.ts
/**
* Merges 2 objects without creating new object references
* The merged props will appear on the `target` object
* If `target` already has a value for a given key it will not be overwritten
*/
const fastDeepMergeAndReplace = (source, target) => {
	if (!source || !target) return;
	for (const key in source) if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== null && typeof source[key] === `object`) {
		if (target[key] === void 0) target[key] = new (Object.getPrototypeOf(source[key])).constructor();
		fastDeepMergeAndReplace(source[key], target[key]);
	} else if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== void 0) target[key] = source[key];
};
const fastDeepMergeAndKeep = (source, target) => {
	if (!source || !target) return;
	for (const key in source) if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== null && typeof source[key] === `object`) {
		if (target[key] === void 0) target[key] = new (Object.getPrototypeOf(source[key])).constructor();
		fastDeepMergeAndKeep(source[key], target[key]);
	} else if (Object.prototype.hasOwnProperty.call(source, key) && target[key] === void 0) target[key] = source[key];
};

//#endregion
Object.defineProperty(exports, 'allSettled', {
  enumerable: true,
  get: function () {
    return allSettled;
  }
});
Object.defineProperty(exports, 'fastDeepMergeAndKeep', {
  enumerable: true,
  get: function () {
    return fastDeepMergeAndKeep;
  }
});
Object.defineProperty(exports, 'fastDeepMergeAndReplace', {
  enumerable: true,
  get: function () {
    return fastDeepMergeAndReplace;
  }
});
Object.defineProperty(exports, 'logErrorInDevMode', {
  enumerable: true,
  get: function () {
    return logErrorInDevMode;
  }
});
//# sourceMappingURL=utils-4vju2Zr4.js.map