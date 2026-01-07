//#region src/webauthn.d.ts
declare function isWebAuthnSupported(): boolean;
declare function isWebAuthnAutofillSupported(): Promise<boolean>;
declare function isWebAuthnPlatformAuthenticatorSupported(): Promise<boolean>;
//#endregion
export { isWebAuthnAutofillSupported, isWebAuthnPlatformAuthenticatorSupported, isWebAuthnSupported };
//# sourceMappingURL=webauthn.d.mts.map