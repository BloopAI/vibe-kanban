//#region src/buildAccountsBaseUrl.ts
/**
* Builds a full origin string pointing to the Account Portal for the given frontend API.
*/
function buildAccountsBaseUrl(frontendApi) {
	if (!frontendApi) return "";
	return `https://${frontendApi.replace(/clerk\.accountsstage\./, "accountsstage.").replace(/clerk\.accounts\.|clerk\./, "accounts.")}`;
}

//#endregion
export { buildAccountsBaseUrl };
//# sourceMappingURL=buildAccountsBaseUrl.mjs.map