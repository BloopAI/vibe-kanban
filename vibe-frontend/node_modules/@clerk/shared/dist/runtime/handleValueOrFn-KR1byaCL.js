
//#region src/utils/handleValueOrFn.ts
function handleValueOrFn(value, url, defaultValue) {
	if (typeof value === "function") return value(url);
	if (typeof value !== "undefined") return value;
	if (typeof defaultValue !== "undefined") return defaultValue;
}

//#endregion
Object.defineProperty(exports, 'handleValueOrFn', {
  enumerable: true,
  get: function () {
    return handleValueOrFn;
  }
});
//# sourceMappingURL=handleValueOrFn-KR1byaCL.js.map