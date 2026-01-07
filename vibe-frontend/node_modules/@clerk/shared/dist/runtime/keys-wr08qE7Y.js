const require_constants = require('./constants-B8tEdUlH.js');
const require_isomorphicAtob = require('./isomorphicAtob-Chnw1Md3.js');
const require_isomorphicBtoa = require('./isomorphicBtoa-oWNvIgSP.js');

//#region src/keys.ts
/** Prefix used for production publishable keys */
const PUBLISHABLE_KEY_LIVE_PREFIX = "pk_live_";
/** Prefix used for development publishable keys */
const PUBLISHABLE_KEY_TEST_PREFIX = "pk_test_";
/**
* Regular expression that matches development frontend API keys.
* Matches patterns like: foo-bar-13.clerk.accounts.dev.
*/
const PUBLISHABLE_FRONTEND_API_DEV_REGEX = /^(([a-z]+)-){2}([0-9]{1,2})\.clerk\.accounts([a-z.]*)(dev|com)$/i;
/**
* Converts a frontend API URL into a base64-encoded publishable key.
*
* @param frontendApi - The frontend API URL (e.g., 'clerk.example.com').
* @returns A base64-encoded publishable key with appropriate prefix (pk_live_ or pk_test_).
*/
function buildPublishableKey(frontendApi) {
	return `${PUBLISHABLE_FRONTEND_API_DEV_REGEX.test(frontendApi) || frontendApi.startsWith("clerk.") && require_constants.LEGACY_DEV_INSTANCE_SUFFIXES.some((s) => frontendApi.endsWith(s)) ? PUBLISHABLE_KEY_TEST_PREFIX : PUBLISHABLE_KEY_LIVE_PREFIX}${require_isomorphicBtoa.isomorphicBtoa(`${frontendApi}$`)}`;
}
/**
* Validates that a decoded publishable key has the correct format.
* The decoded value should be a frontend API followed by exactly one '$' at the end.
*
* @param decoded - The decoded publishable key string to validate.
* @returns `true` if the decoded key has valid format, `false` otherwise.
*/
function isValidDecodedPublishableKey(decoded) {
	if (!decoded.endsWith("$")) return false;
	const withoutTrailing = decoded.slice(0, -1);
	if (withoutTrailing.includes("$")) return false;
	return withoutTrailing.includes(".");
}
/**
* Parses and validates a publishable key, extracting the frontend API and instance type.
*
* @param key - The publishable key to parse.
* @param options - Configuration options for parsing.
* @param options.fatal
* @param options.domain
* @param options.proxyUrl
* @param options.isSatellite
* @returns Parsed publishable key object with instanceType and frontendApi, or null if invalid.
*
* @throws {Error} When options.fatal is true and key is missing or invalid.
*/
function parsePublishableKey(key, options = {}) {
	key = key || "";
	if (!key || !isPublishableKey(key)) {
		if (options.fatal && !key) throw new Error("Publishable key is missing. Ensure that your publishable key is correctly configured. Double-check your environment configuration for your keys, or access them here: https://dashboard.clerk.com/last-active?path=api-keys");
		if (options.fatal && !isPublishableKey(key)) throw new Error("Publishable key not valid.");
		return null;
	}
	const instanceType = key.startsWith(PUBLISHABLE_KEY_LIVE_PREFIX) ? "production" : "development";
	let decodedFrontendApi;
	try {
		decodedFrontendApi = require_isomorphicAtob.isomorphicAtob(key.split("_")[2]);
	} catch {
		if (options.fatal) throw new Error("Publishable key not valid: Failed to decode key.");
		return null;
	}
	if (!isValidDecodedPublishableKey(decodedFrontendApi)) {
		if (options.fatal) throw new Error("Publishable key not valid: Decoded key has invalid format.");
		return null;
	}
	let frontendApi = decodedFrontendApi.slice(0, -1);
	if (options.proxyUrl) frontendApi = options.proxyUrl;
	else if (instanceType !== "development" && options.domain && options.isSatellite) frontendApi = `clerk.${options.domain}`;
	return {
		instanceType,
		frontendApi
	};
}
/**
* Checks if the provided key is a valid publishable key.
*
* @param key - The key to be checked. Defaults to an empty string if not provided.
* @returns `true` if 'key' is a valid publishable key, `false` otherwise.
*/
function isPublishableKey(key = "") {
	try {
		if (!(key.startsWith(PUBLISHABLE_KEY_LIVE_PREFIX) || key.startsWith(PUBLISHABLE_KEY_TEST_PREFIX))) return false;
		const parts = key.split("_");
		if (parts.length !== 3) return false;
		const encodedPart = parts[2];
		if (!encodedPart) return false;
		return isValidDecodedPublishableKey(require_isomorphicAtob.isomorphicAtob(encodedPart));
	} catch {
		return false;
	}
}
/**
* Creates a memoized cache for checking if URLs are development or staging environments.
* Uses a Map to cache results for better performance on repeated checks.
*
* @returns An object with an isDevOrStagingUrl method that checks if a URL is dev/staging.
*/
function createDevOrStagingUrlCache() {
	const devOrStagingUrlCache = /* @__PURE__ */ new Map();
	return { isDevOrStagingUrl: (url) => {
		if (!url) return false;
		const hostname = typeof url === "string" ? url : url.hostname;
		let res = devOrStagingUrlCache.get(hostname);
		if (res === void 0) {
			res = require_constants.DEV_OR_STAGING_SUFFIXES.some((s) => hostname.endsWith(s));
			devOrStagingUrlCache.set(hostname, res);
		}
		return res;
	} };
}
/**
* Checks if a publishable key is for a development environment.
* Supports both legacy format (test_) and new format (pk_test_).
*
* @param apiKey - The API key to check.
* @returns `true` if the key is for development, `false` otherwise.
*/
function isDevelopmentFromPublishableKey(apiKey) {
	return apiKey.startsWith("test_") || apiKey.startsWith("pk_test_");
}
/**
* Checks if a publishable key is for a production environment.
* Supports both legacy format (live_) and new format (pk_live_).
*
* @param apiKey - The API key to check.
* @returns `true` if the key is for production, `false` otherwise.
*/
function isProductionFromPublishableKey(apiKey) {
	return apiKey.startsWith("live_") || apiKey.startsWith("pk_live_");
}
/**
* Checks if a secret key is for a development environment.
* Supports both legacy format (test_) and new format (sk_test_).
*
* @param apiKey - The secret key to check.
* @returns `true` if the key is for development, `false` otherwise.
*/
function isDevelopmentFromSecretKey(apiKey) {
	return apiKey.startsWith("test_") || apiKey.startsWith("sk_test_");
}
/**
* Checks if a secret key is for a production environment.
* Supports both legacy format (live_) and new format (sk_live_).
*
* @param apiKey - The secret key to check.
* @returns `true` if the key is for production, `false` otherwise.
*/
function isProductionFromSecretKey(apiKey) {
	return apiKey.startsWith("live_") || apiKey.startsWith("sk_live_");
}
/**
* Generates a unique cookie suffix based on the publishable key using SHA-1 hashing.
* The suffix is base64-encoded and URL-safe (+ and / characters are replaced).
*
* @param publishableKey - The publishable key to generate suffix from.
* @param subtle - The SubtleCrypto interface to use for hashing (defaults to globalThis.crypto.subtle).
* @returns A promise that resolves to an 8-character URL-safe base64 string.
*/
async function getCookieSuffix(publishableKey, subtle = globalThis.crypto.subtle) {
	const data = new TextEncoder().encode(publishableKey);
	const digest = await subtle.digest("sha-1", data);
	return require_isomorphicBtoa.isomorphicBtoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/gi, "-").replace(/\//gi, "_").substring(0, 8);
}
/**
* Creates a suffixed cookie name by appending the cookie suffix to the base name.
* Used to create unique cookie names based on the publishable key.
*
* @param cookieName - The base cookie name.
* @param cookieSuffix - The suffix to append (typically generated by getCookieSuffix).
* @returns The suffixed cookie name in format: `${cookieName}_${cookieSuffix}`.
*/
const getSuffixedCookieName = (cookieName, cookieSuffix) => {
	return `${cookieName}_${cookieSuffix}`;
};

//#endregion
Object.defineProperty(exports, 'buildPublishableKey', {
  enumerable: true,
  get: function () {
    return buildPublishableKey;
  }
});
Object.defineProperty(exports, 'createDevOrStagingUrlCache', {
  enumerable: true,
  get: function () {
    return createDevOrStagingUrlCache;
  }
});
Object.defineProperty(exports, 'getCookieSuffix', {
  enumerable: true,
  get: function () {
    return getCookieSuffix;
  }
});
Object.defineProperty(exports, 'getSuffixedCookieName', {
  enumerable: true,
  get: function () {
    return getSuffixedCookieName;
  }
});
Object.defineProperty(exports, 'isDevelopmentFromPublishableKey', {
  enumerable: true,
  get: function () {
    return isDevelopmentFromPublishableKey;
  }
});
Object.defineProperty(exports, 'isDevelopmentFromSecretKey', {
  enumerable: true,
  get: function () {
    return isDevelopmentFromSecretKey;
  }
});
Object.defineProperty(exports, 'isProductionFromPublishableKey', {
  enumerable: true,
  get: function () {
    return isProductionFromPublishableKey;
  }
});
Object.defineProperty(exports, 'isProductionFromSecretKey', {
  enumerable: true,
  get: function () {
    return isProductionFromSecretKey;
  }
});
Object.defineProperty(exports, 'isPublishableKey', {
  enumerable: true,
  get: function () {
    return isPublishableKey;
  }
});
Object.defineProperty(exports, 'parsePublishableKey', {
  enumerable: true,
  get: function () {
    return parsePublishableKey;
  }
});
//# sourceMappingURL=keys-wr08qE7Y.js.map