import { isValidBrowser } from "./browser-D5e8obql.mjs";

//#region src/webauthn.ts
function isWebAuthnSupported() {
	return isValidBrowser() && typeof window.PublicKeyCredential === "function";
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
export { isWebAuthnAutofillSupported, isWebAuthnPlatformAuthenticatorSupported, isWebAuthnSupported };
//# sourceMappingURL=webauthn.mjs.map