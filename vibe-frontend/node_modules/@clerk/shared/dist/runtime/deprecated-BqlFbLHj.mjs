import { isProductionEnvironment, isTestEnvironment } from "./runtimeEnvironment-BB2sO-19.mjs";

//#region src/deprecated.ts
/**
* Mark class method / function as deprecated.
*
* A console WARNING will be displayed when class method / function is invoked.
*
* Examples
* 1. Deprecate class method
* class Example {
*   getSomething = (arg1, arg2) => {
*       deprecated('Example.getSomething', 'Use `getSomethingElse` instead.');
*       return `getSomethingValue:${arg1 || '-'}:${arg2 || '-'}`;
*   };
* }
*
* 2. Deprecate function
* const getSomething = () => {
*   deprecated('getSomething', 'Use `getSomethingElse` instead.');
*   return 'getSomethingValue';
* };
*/
const displayedWarnings = /* @__PURE__ */ new Set();
const deprecated = (fnName, warning, key) => {
	const hideWarning = isTestEnvironment() || isProductionEnvironment();
	const messageId = key ?? fnName;
	if (displayedWarnings.has(messageId) || hideWarning) return;
	displayedWarnings.add(messageId);
	console.warn(`Clerk - DEPRECATION WARNING: "${fnName}" is deprecated and will be removed in the next major release.\n${warning}`);
};
const deprecatedProperty = (cls, propName, warning, isStatic = false) => {
	const target = isStatic ? cls : cls.prototype;
	let value = target[propName];
	Object.defineProperty(target, propName, {
		get() {
			deprecated(propName, warning, `${cls.name}:${propName}`);
			return value;
		},
		set(v) {
			value = v;
		}
	});
};
/**
* Mark object property as deprecated.
*
* A console WARNING will be displayed when object property is being accessed.
*
* 1. Deprecate object property
* const obj = { something: 'aloha' };
*
* deprecatedObjectProperty(obj, 'something', 'Use `somethingElse` instead.');
*/
const deprecatedObjectProperty = (obj, propName, warning, key) => {
	let value = obj[propName];
	Object.defineProperty(obj, propName, {
		get() {
			deprecated(propName, warning, key);
			return value;
		},
		set(v) {
			value = v;
		}
	});
};

//#endregion
export { deprecated, deprecatedObjectProperty, deprecatedProperty };
//# sourceMappingURL=deprecated-BqlFbLHj.mjs.map