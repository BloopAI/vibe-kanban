//#region src/getEnvVariable.ts
const hasCloudflareProxyContext = (context) => {
	return !!context?.cloudflare?.env;
};
const hasCloudflareContext = (context) => {
	return !!context?.env;
};
/**
* Retrieves an environment variable across runtime environments.
*
* @param name - The environment variable name to retrieve.
* @param context - Optional context object that may contain environment values.
* @returns The environment variable value or empty string if not found.
*/
const getEnvVariable = (name, context) => {
	if (typeof process !== "undefined" && process.env && typeof process.env[name] === "string") return process.env[name];
	if (typeof import.meta !== "undefined" && import.meta.env && typeof import.meta.env[name] === "string") return import.meta.env[name];
	if (hasCloudflareProxyContext(context)) return context.cloudflare.env[name] || "";
	if (hasCloudflareContext(context)) return context.env[name] || "";
	if (context && typeof context[name] === "string") return context[name];
	try {
		return globalThis[name];
	} catch {}
	return "";
};

//#endregion
export { getEnvVariable };
//# sourceMappingURL=getEnvVariable-BSXrgsT3.mjs.map