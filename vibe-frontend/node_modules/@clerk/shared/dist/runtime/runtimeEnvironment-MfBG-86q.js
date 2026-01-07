
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
Object.defineProperty(exports, 'isDevelopmentEnvironment', {
  enumerable: true,
  get: function () {
    return isDevelopmentEnvironment;
  }
});
Object.defineProperty(exports, 'isProductionEnvironment', {
  enumerable: true,
  get: function () {
    return isProductionEnvironment;
  }
});
Object.defineProperty(exports, 'isTestEnvironment', {
  enumerable: true,
  get: function () {
    return isTestEnvironment;
  }
});
//# sourceMappingURL=runtimeEnvironment-MfBG-86q.js.map