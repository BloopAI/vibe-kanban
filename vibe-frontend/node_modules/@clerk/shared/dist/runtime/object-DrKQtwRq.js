
//#region src/object.ts
const without = (obj, ...props) => {
	const copy = { ...obj };
	for (const prop of props) delete copy[prop];
	return copy;
};
const removeUndefined = (obj) => {
	return Object.entries(obj).reduce((acc, [key, value]) => {
		if (value !== void 0 && value !== null) acc[key] = value;
		return acc;
	}, {});
};
const applyFunctionToObj = (obj, fn) => {
	const result = {};
	for (const key in obj) result[key] = fn(obj[key], key);
	return result;
};
const filterProps = (obj, filter) => {
	const result = {};
	for (const key in obj) if (obj[key] && filter(obj[key])) result[key] = obj[key];
	return result;
};

//#endregion
Object.defineProperty(exports, 'applyFunctionToObj', {
  enumerable: true,
  get: function () {
    return applyFunctionToObj;
  }
});
Object.defineProperty(exports, 'filterProps', {
  enumerable: true,
  get: function () {
    return filterProps;
  }
});
Object.defineProperty(exports, 'removeUndefined', {
  enumerable: true,
  get: function () {
    return removeUndefined;
  }
});
Object.defineProperty(exports, 'without', {
  enumerable: true,
  get: function () {
    return without;
  }
});
//# sourceMappingURL=object-DrKQtwRq.js.map