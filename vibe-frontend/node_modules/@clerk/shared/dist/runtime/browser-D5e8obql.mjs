//#region src/browser.ts
/**
* Checks if the window object is defined. You can also use this to check if something is happening on the client side.
* @returns {boolean}
*/
function inBrowser() {
	return typeof window !== "undefined";
}
const botAgentRegex = new RegExp([
	"bot",
	"spider",
	"crawl",
	"APIs-Google",
	"AdsBot",
	"Googlebot",
	"mediapartners",
	"Google Favicon",
	"FeedFetcher",
	"Google-Read-Aloud",
	"DuplexWeb-Google",
	"googleweblight",
	"bing",
	"yandex",
	"baidu",
	"duckduck",
	"yahoo",
	"ecosia",
	"ia_archiver",
	"facebook",
	"instagram",
	"pinterest",
	"reddit",
	"slack",
	"twitter",
	"whatsapp",
	"youtube",
	"semrush"
].join("|"), "i");
/**
* Checks if the user agent is a bot.
* @param userAgent - Any user agent string
* @returns {boolean}
*/
function userAgentIsRobot(userAgent) {
	return !userAgent ? false : botAgentRegex.test(userAgent);
}
/**
* Checks if the current environment is a browser and the user agent is not a bot.
* @returns {boolean}
*/
function isValidBrowser() {
	const navigator = inBrowser() ? window?.navigator : null;
	if (!navigator) return false;
	return !userAgentIsRobot(navigator?.userAgent) && !navigator?.webdriver;
}
/**
* Checks if the current environment is a browser and if the navigator is online.
* @returns {boolean}
*/
function isBrowserOnline() {
	const navigator = inBrowser() ? window?.navigator : null;
	if (!navigator) return false;
	const isNavigatorOnline = navigator?.onLine;
	return navigator?.connection?.rtt !== 0 && navigator?.connection?.downlink !== 0 && isNavigatorOnline;
}
/**
* Runs `isBrowserOnline` and `isValidBrowser` to check if the current environment is a valid browser and if the navigator is online.
* @returns {boolean}
*/
function isValidBrowserOnline() {
	return isBrowserOnline() && isValidBrowser();
}

//#endregion
export { inBrowser, isBrowserOnline, isValidBrowser, isValidBrowserOnline, userAgentIsRobot };
//# sourceMappingURL=browser-D5e8obql.mjs.map