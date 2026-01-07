//#region src/proxy.d.ts
declare function isValidProxyUrl(key: string | undefined): boolean;
declare function isHttpOrHttps(key: string | undefined): boolean;
declare function isProxyUrlRelative(key: string): boolean;
declare function proxyUrlToAbsoluteURL(url: string | undefined): string;
//#endregion
export { isHttpOrHttps, isProxyUrlRelative, isValidProxyUrl, proxyUrlToAbsoluteURL };
//# sourceMappingURL=proxy-QCdxwhZi.d.ts.map