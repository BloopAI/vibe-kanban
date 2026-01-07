//#region src/isomorphicBtoa.ts
const isomorphicBtoa = (data) => {
	if (typeof btoa !== "undefined" && typeof btoa === "function") return btoa(data);
	else if (typeof global !== "undefined" && global.Buffer) return new global.Buffer(data).toString("base64");
	return data;
};

//#endregion
export { isomorphicBtoa };
//# sourceMappingURL=isomorphicBtoa-Dr7WubZv.mjs.map