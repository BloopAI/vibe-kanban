const require_noop = require('./noop-Bi5xtB31.js');

//#region src/utils/createDeferredPromise.ts
/**
* Create a promise that can be resolved or rejected from
* outside the Promise constructor callback
* A ES6 compatible utility that implements `Promise.withResolvers`
* @internal
*/
const createDeferredPromise = () => {
	let resolve = require_noop.noop;
	let reject = require_noop.noop;
	return {
		promise: new Promise((res, rej) => {
			resolve = res;
			reject = rej;
		}),
		resolve,
		reject
	};
};

//#endregion
Object.defineProperty(exports, 'createDeferredPromise', {
  enumerable: true,
  get: function () {
    return createDeferredPromise;
  }
});
//# sourceMappingURL=createDeferredPromise-BgvUcqYv.js.map