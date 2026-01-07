import Cookies from "js-cookie";

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
			return Cookies.get(cookieName);
		},
		set(newValue, options = {}) {
			Cookies.set(cookieName, newValue, options);
		},
		remove(cookieAttributes) {
			Cookies.remove(cookieName, cookieAttributes);
		}
	};
}

//#endregion
export { createCookieHandler };
//# sourceMappingURL=cookie.mjs.map