//#region src/utils/runtimeEnvironment.ts
const isDevelopmentEnvironment = () => {
	try {
		return process.env.NODE_ENV === "development";
	} catch {}
	return false;
};
const isTestEnvironment = () => {
	try {
		return process.env.NODE_ENV === "test";
	} catch {}
	return false;
};
const isProductionEnvironment = () => {
	try {
		return process.env.NODE_ENV === "production";
	} catch {}
	return false;
};

//#endregion
export { isDevelopmentEnvironment, isProductionEnvironment, isTestEnvironment };
//# sourceMappingURL=runtimeEnvironment-BB2sO-19.mjs.map