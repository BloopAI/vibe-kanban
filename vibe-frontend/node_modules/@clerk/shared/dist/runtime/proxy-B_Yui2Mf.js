
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
Object.defineProperty(exports, 'isHttpOrHttps', {
  enumerable: true,
  get: function () {
    return isHttpOrHttps;
  }
});
Object.defineProperty(exports, 'isProxyUrlRelative', {
  enumerable: true,
  get: function () {
    return isProxyUrlRelative;
  }
});
Object.defineProperty(exports, 'isValidProxyUrl', {
  enumerable: true,
  get: function () {
    return isValidProxyUrl;
  }
});
Object.defineProperty(exports, 'proxyUrlToAbsoluteURL', {
  enumerable: true,
  get: function () {
    return proxyUrlToAbsoluteURL;
  }
});
//# sourceMappingURL=proxy-B_Yui2Mf.js.map