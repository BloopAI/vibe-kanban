//#region src/proxy.ts
function isValidProxyUrl(key) {
	if (!key) return true;
	return isHttpOrHttps(key) || isProxyUrlRelative(key);
}
function isHttpOrHttps(key) {
	return /^http(s)?:\/\//.test(key || "");
}
function isProxyUrlRelative(key) {
	return key.startsWith("/");
}
function proxyUrlToAbsoluteURL(url) {
	if (!url) return "";
	return isProxyUrlRelative(url) ? new URL(url, window.location.origin).toString() : url;
}

//#endregion
export { isHttpOrHttps, isProxyUrlRelative, isValidProxyUrl, proxyUrlToAbsoluteURL };
//# sourceMappingURL=proxy-Bq8EHApG.mjs.map