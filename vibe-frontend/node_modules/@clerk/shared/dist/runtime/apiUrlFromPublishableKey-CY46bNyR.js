const require_constants = require('./constants-B8tEdUlH.js');
const require_keys = require('./keys-wr08qE7Y.js');

//#region src/apiUrlFromPublishableKey.ts
/**
* Get the correct API url based on the publishable key.
*
* @param publishableKey - The publishable key to parse.
* @returns One of Clerk's API URLs.
*/
const apiUrlFromPublishableKey = (publishableKey) => {
	const frontendApi = require_keys.parsePublishableKey(publishableKey)?.frontendApi;
	if (frontendApi?.startsWith("clerk.") && require_constants.LEGACY_DEV_INSTANCE_SUFFIXES.some((suffix) => frontendApi?.endsWith(suffix))) return require_constants.PROD_API_URL;
	if (require_constants.LOCAL_ENV_SUFFIXES.some((suffix) => frontendApi?.endsWith(suffix))) return require_constants.LOCAL_API_URL;
	if (require_constants.STAGING_ENV_SUFFIXES.some((suffix) => frontendApi?.endsWith(suffix))) return require_constants.STAGING_API_URL;
	return require_constants.PROD_API_URL;
};

//#endregion
Object.defineProperty(exports, 'apiUrlFromPublishableKey', {
  enumerable: true,
  get: function () {
    return apiUrlFromPublishableKey;
  }
});
//# sourceMappingURL=apiUrlFromPublishableKey-CY46bNyR.js.map