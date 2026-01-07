import { LEGACY_DEV_INSTANCE_SUFFIXES, LOCAL_API_URL, LOCAL_ENV_SUFFIXES, PROD_API_URL, STAGING_API_URL, STAGING_ENV_SUFFIXES } from "./constants-ByUssRbE.mjs";
import { parsePublishableKey } from "./keys-YNv6yjKk.mjs";

//#region src/apiUrlFromPublishableKey.ts
/**
* Get the correct API url based on the publishable key.
*
* @param publishableKey - The publishable key to parse.
* @returns One of Clerk's API URLs.
*/
const apiUrlFromPublishableKey = (publishableKey) => {
	const frontendApi = parsePublishableKey(publishableKey)?.frontendApi;
	if (frontendApi?.startsWith("clerk.") && LEGACY_DEV_INSTANCE_SUFFIXES.some((suffix) => frontendApi?.endsWith(suffix))) return PROD_API_URL;
	if (LOCAL_ENV_SUFFIXES.some((suffix) => frontendApi?.endsWith(suffix))) return LOCAL_API_URL;
	if (STAGING_ENV_SUFFIXES.some((suffix) => frontendApi?.endsWith(suffix))) return STAGING_API_URL;
	return PROD_API_URL;
};

//#endregion
export { apiUrlFromPublishableKey };
//# sourceMappingURL=apiUrlFromPublishableKey-B2KkwQp6.mjs.map