const require_browser = require('./browser-Ch5Nzweq.js');

//#region src/webauthn.ts
function isWebAuthnSupported() {
	return require_browser.isValidBrowser() && typeof window.PublicKeyCredential === "function";
}
async function isWebAuthnAutofillSupported() {
	try {
		return isWebAuthnSupported() && await window.PublicKeyCredential.isConditionalMediationAvailable();
	} catch {
		return false;
	}
}
async function isWebAuthnPlatformAuthenticatorSupported() {
	try {
		return typeof window !== "undefined" && await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
	} catch {
		return false;
	}
}

//#endregion
exports.isWebAuthnAutofillSupported = isWebAuthnAutofillSupported;
exports.isWebAuthnPlatformAuthenticatorSupported = isWebAuthnPlatformAuthenticatorSupported;
exports.isWebAuthnSupported = isWebAuthnSupported;
//# sourceMappingURL=webauthn.js.map