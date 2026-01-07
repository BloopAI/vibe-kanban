const require_keys = require('./keys-wr08qE7Y.js');

//#region src/netlifyCacheHandler.ts
/**
* Cache busting parameter for Netlify to prevent cached responses
* during handshake flows with Clerk development instances.
*
* Note: This query parameter will be removed in the "@clerk/clerk-js" package.
*
* @internal
*/
const CLERK_NETLIFY_CACHE_BUST_PARAM = "__clerk_netlify_cache_bust";
/**
* Returns true if running in a Netlify environment.
* Checks for Netlify-specific environment variables in process.env.
* Safe for browser and non-Node environments.
*/
function isNetlifyRuntime() {
	if (typeof process === "undefined" || !process.env) return false;
	return Boolean(process.env.NETLIFY) || Boolean(process.env.NETLIFY_FUNCTIONS_TOKEN) || typeof process.env.URL === "string" && process.env.URL.endsWith("netlify.app");
}
/**
* Prevents infinite redirects in Netlify's functions by adding a cache bust parameter
* to the original redirect URL. This ensures that Netlify doesn't serve a cached response
* during the handshake flow.
*
* The issue happens only on Clerk development instances running on Netlify. This is
* a workaround until we find a better solution.
*
* See https://answers.netlify.com/t/cache-handling-recommendation-for-authentication-handshake-redirects/143969/1.
*
* @internal
*/
function handleNetlifyCacheInDevInstance({ locationHeader, requestStateHeaders, publishableKey }) {
	const isOnNetlify = isNetlifyRuntime();
	const isDevelopmentInstance = require_keys.isDevelopmentFromPublishableKey(publishableKey);
	if (isOnNetlify && isDevelopmentInstance) {
		if (!locationHeader.includes("__clerk_handshake")) {
			const url = new URL(locationHeader);
			url.searchParams.append(CLERK_NETLIFY_CACHE_BUST_PARAM, Date.now().toString());
			requestStateHeaders.set("Location", url.toString());
		}
	}
}

//#endregion
Object.defineProperty(exports, 'CLERK_NETLIFY_CACHE_BUST_PARAM', {
  enumerable: true,
  get: function () {
    return CLERK_NETLIFY_CACHE_BUST_PARAM;
  }
});
Object.defineProperty(exports, 'handleNetlifyCacheInDevInstance', {
  enumerable: true,
  get: function () {
    return handleNetlifyCacheInDevInstance;
  }
});
//# sourceMappingURL=netlifyCacheHandler-CGV6jGfB.js.map