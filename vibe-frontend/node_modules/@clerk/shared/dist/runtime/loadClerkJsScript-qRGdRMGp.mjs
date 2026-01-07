import { createDevOrStagingUrlCache, parsePublishableKey } from "./keys-YNv6yjKk.mjs";
import { ClerkRuntimeError, buildErrorThrower } from "./error-Dl9xmUf3.mjs";
import { loadScript } from "./loadScript-t1vaIfy5.mjs";
import { isValidProxyUrl, proxyUrlToAbsoluteURL } from "./proxy-Bq8EHApG.mjs";
import { addClerkPrefix } from "./url-Cdy8w8vK.mjs";
import { versionSelector } from "./versionSelector-D29MCAQA.mjs";

//#region src/loadClerkJsScript.ts
const ERROR_CODE = "failed_to_load_clerk_js";
const ERROR_CODE_TIMEOUT = "failed_to_load_clerk_js_timeout";
const FAILED_TO_LOAD_ERROR = "Failed to load Clerk";
const { isDevOrStagingUrl } = createDevOrStagingUrlCache();
const errorThrower = buildErrorThrower({ packageName: "@clerk/shared" });
/**
* Sets the package name for error messages during ClerkJS script loading.
*
* @param packageName - The name of the package to use in error messages (e.g., '@clerk/clerk-react').
* @example
* ```typescript
* setClerkJsLoadingErrorPackageName('@clerk/clerk-react');
* ```
*/
function setClerkJsLoadingErrorPackageName(packageName) {
	errorThrower.setPackageName({ packageName });
}
/**
* Validates that window.Clerk exists and is properly initialized.
* This ensures we don't have false positives where the script loads but Clerk is malformed.
*
* @returns `true` if window.Clerk exists and has the expected structure with a load method.
*/
function isClerkProperlyLoaded() {
	if (typeof window === "undefined" || !window.Clerk) return false;
	const clerk = window.Clerk;
	return typeof clerk === "object" && typeof clerk.load === "function";
}
/**
* Checks if an existing script has a request error using Performance API.
*
* @param scriptUrl - The URL of the script to check.
* @returns True if the script has failed to load due to a network/HTTP error.
*/
function hasScriptRequestError(scriptUrl) {
	if (typeof window === "undefined" || !window.performance) return false;
	const entries = performance.getEntriesByName(scriptUrl, "resource");
	if (entries.length === 0) return false;
	const scriptEntry = entries[entries.length - 1];
	if (scriptEntry.transferSize === 0 && scriptEntry.decodedBodySize === 0) {
		if (scriptEntry.responseEnd === 0) return true;
		if (scriptEntry.responseEnd > 0 && scriptEntry.responseStart > 0) return true;
		if ("responseStatus" in scriptEntry) {
			if (scriptEntry.responseStatus >= 400) return true;
			if (scriptEntry.responseStatus === 0) return true;
		}
	}
	return false;
}
/**
* Waits for Clerk to be properly loaded with a timeout mechanism.
* Uses polling to check if Clerk becomes available within the specified timeout.
*
* @param timeoutMs - Maximum time to wait in milliseconds.
* @param existingScript - The existing script element to wait for. Optional, for existing scripts.
* @returns Promise that resolves with null if Clerk loads successfully, or rejects with an error if timeout is reached.
*/
function waitForClerkWithTimeout(timeoutMs, existingScript) {
	return new Promise((resolve, reject) => {
		let resolved = false;
		const cleanup = (timeoutId$1, pollInterval$1) => {
			clearTimeout(timeoutId$1);
			clearInterval(pollInterval$1);
		};
		existingScript?.addEventListener("error", () => {
			cleanup(timeoutId, pollInterval);
			reject(new ClerkRuntimeError(FAILED_TO_LOAD_ERROR, { code: ERROR_CODE }));
		});
		const checkAndResolve = () => {
			if (resolved) return;
			if (isClerkProperlyLoaded()) {
				resolved = true;
				cleanup(timeoutId, pollInterval);
				resolve(null);
			}
		};
		const handleTimeout = () => {
			if (resolved) return;
			resolved = true;
			cleanup(timeoutId, pollInterval);
			if (!isClerkProperlyLoaded()) reject(new ClerkRuntimeError(FAILED_TO_LOAD_ERROR, { code: ERROR_CODE_TIMEOUT }));
			else resolve(null);
		};
		const timeoutId = setTimeout(handleTimeout, timeoutMs);
		checkAndResolve();
		const pollInterval = setInterval(() => {
			if (resolved) {
				clearInterval(pollInterval);
				return;
			}
			checkAndResolve();
		}, 100);
	});
}
/**
* Hotloads the Clerk JS script with robust failure detection and retry logic.
*
* For existing scripts:
* - If no request error detected: waits for timeout, then retries with loadScript if timeout expires
* - If request error detected: immediately retries with loadScript.
*
* For new scripts: uses loadScript which has built-in retry logic via the retry utility.
*
* @param opts - The options used to build the Clerk JS script URL and load the script.
*               Must include a `publishableKey` if no existing script is found.
* @returns Promise that resolves with null if Clerk loads successfully, or rejects with an error.
*
* @example
* ```typescript
* try {
*   await loadClerkJsScript({ publishableKey: 'pk_test_...' });
*   console.log('Clerk loaded successfully');
* } catch (error) {
*   console.error('Failed to load Clerk:', error.message);
* }
* ```
*/
const loadClerkJsScript = async (opts) => {
	const timeout = opts?.scriptLoadTimeout ?? 15e3;
	if (isClerkProperlyLoaded()) return null;
	if (!opts?.publishableKey) {
		errorThrower.throwMissingPublishableKeyError();
		return null;
	}
	const scriptUrl = clerkJsScriptUrl(opts);
	const existingScript = document.querySelector("script[data-clerk-js-script]");
	if (existingScript) if (hasScriptRequestError(scriptUrl)) existingScript.remove();
	else try {
		await waitForClerkWithTimeout(timeout, existingScript);
		return null;
	} catch {
		existingScript.remove();
	}
	const loadPromise = waitForClerkWithTimeout(timeout);
	loadScript(scriptUrl, {
		async: true,
		crossOrigin: "anonymous",
		nonce: opts.nonce,
		beforeLoad: applyClerkJsScriptAttributes(opts)
	}).catch((error) => {
		throw new ClerkRuntimeError(FAILED_TO_LOAD_ERROR + (error.message ? `, ${error.message}` : ""), {
			code: ERROR_CODE,
			cause: error
		});
	});
	return loadPromise;
};
/**
* Generates a Clerk JS script URL based on the provided options.
*
* @param opts - The options to use when building the Clerk JS script URL.
* @returns The complete URL to the Clerk JS script.
*
* @example
* ```typescript
* const url = clerkJsScriptUrl({ publishableKey: 'pk_test_...' });
* // Returns: "https://example.clerk.accounts.dev/npm/@clerk/clerk-js@5/dist/clerk.browser.js"
* ```
*/
const clerkJsScriptUrl = (opts) => {
	const { clerkJSUrl, clerkJSVariant, clerkJSVersion, proxyUrl, domain, publishableKey } = opts;
	if (clerkJSUrl) return clerkJSUrl;
	let scriptHost = "";
	if (!!proxyUrl && isValidProxyUrl(proxyUrl)) scriptHost = proxyUrlToAbsoluteURL(proxyUrl).replace(/http(s)?:\/\//, "");
	else if (domain && !isDevOrStagingUrl(parsePublishableKey(publishableKey)?.frontendApi || "")) scriptHost = addClerkPrefix(domain);
	else scriptHost = parsePublishableKey(publishableKey)?.frontendApi || "";
	const variant = clerkJSVariant ? `${clerkJSVariant.replace(/\.+$/, "")}.` : "";
	const version = versionSelector(clerkJSVersion);
	return `https://${scriptHost}/npm/@clerk/clerk-js@${version}/dist/clerk.${variant}browser.js`;
};
/**
* Builds an object of Clerk JS script attributes based on the provided options.
*
* @param options - The options containing the values for script attributes.
* @returns An object containing data attributes to be applied to the script element.
*/
const buildClerkJsScriptAttributes = (options) => {
	const obj = {};
	if (options.publishableKey) obj["data-clerk-publishable-key"] = options.publishableKey;
	if (options.proxyUrl) obj["data-clerk-proxy-url"] = options.proxyUrl;
	if (options.domain) obj["data-clerk-domain"] = options.domain;
	if (options.nonce) obj.nonce = options.nonce;
	return obj;
};
/**
* Returns a function that applies Clerk JS script attributes to a script element.
*
* @param options - The options containing the values for script attributes.
* @returns A function that accepts a script element and applies the attributes to it.
*/
const applyClerkJsScriptAttributes = (options) => (script) => {
	const attributes = buildClerkJsScriptAttributes(options);
	for (const attribute in attributes) script.setAttribute(attribute, attributes[attribute]);
};

//#endregion
export { buildClerkJsScriptAttributes, clerkJsScriptUrl, loadClerkJsScript, setClerkJsLoadingErrorPackageName };
//# sourceMappingURL=loadClerkJsScript-qRGdRMGp.mjs.map