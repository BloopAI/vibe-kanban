const require_chunk = require('./chunk-nOFOJqeH.js');
let js_cookie = require("js-cookie");
js_cookie = require_chunk.__toESM(js_cookie);

//#region src/cookie.ts
/**
* Creates helper methods for dealing with a specific cookie.
*
* @example
* ```ts
* const cookie = createCookieHandler('my_cookie')
*
* cookie.set('my_value');
* cookie.get() // 'my_value';
* cookie.remove()
* ```
*/
function createCookieHandler(cookieName) {
	return {
		get() {
			return js_cookie.default.get(cookieName);
		},
		set(newValue, options = {}) {
			js_cookie.default.set(cookieName, newValue, options);
		},
		remove(cookieAttributes) {
			js_cookie.default.remove(cookieName, cookieAttributes);
		}
	};
}

//#endregion
exports.createCookieHandler = createCookieHandler;
//# sourceMappingURL=cookie.js.map