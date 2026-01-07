//#region src/browser.d.ts
/**
 * Checks if the window object is defined. You can also use this to check if something is happening on the client side.
 * @returns {boolean}
 */
declare function inBrowser(): boolean;
/**
 * Checks if the user agent is a bot.
 * @param userAgent - Any user agent string
 * @returns {boolean}
 */
declare function userAgentIsRobot(userAgent: string): boolean;
/**
 * Checks if the current environment is a browser and the user agent is not a bot.
 * @returns {boolean}
 */
declare function isValidBrowser(): boolean;
/**
 * Checks if the current environment is a browser and if the navigator is online.
 * @returns {boolean}
 */
declare function isBrowserOnline(): boolean;
/**
 * Runs `isBrowserOnline` and `isValidBrowser` to check if the current environment is a valid browser and if the navigator is online.
 * @returns {boolean}
 */
declare function isValidBrowserOnline(): boolean;
//#endregion
export { inBrowser, isBrowserOnline, isValidBrowser, isValidBrowserOnline, userAgentIsRobot };
//# sourceMappingURL=browser-CT1g0w-N.d.ts.map