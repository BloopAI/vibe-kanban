import "./constants-ByUssRbE.mjs";
import "./instance-Cze6Nv61.mjs";
import { isAbsoluteUrl, withLeadingSlash, withoutTrailingSlash } from "./url-Cdy8w8vK.mjs";
import React, { createContext, useContext } from "react";

//#region src/router/router.ts
const PRESERVED_QUERYSTRING_PARAMS = [
	"after_sign_in_url",
	"after_sign_up_url",
	"redirect_url"
];
/**
* Ensures the provided path has a leading slash and no trailing slash
*/
function normalizePath(path) {
	return withoutTrailingSlash(withLeadingSlash(path));
}
/**
* Factory function to create an instance of ClerkRouter with the provided host router.
*
* @param router - host router instance to be used by the router
* @param basePath - base path of the router, navigation and matching will be scoped to this path
* @returns A ClerkRouter instance
*/
function createClerkRouter(router, basePath = "/") {
	const normalizedBasePath = normalizePath(basePath);
	/**
	* Certain query parameters need to be preserved when navigating internally. These query parameters are ultimately used by Clerk to dictate behavior, so we keep them around.
	*/
	function makeDestinationUrlWithPreservedQueryParameters(path) {
		if (isAbsoluteUrl(path)) return path;
		const destinationUrl = new URL(path, window.location.origin);
		const currentSearchParams = router.searchParams();
		PRESERVED_QUERYSTRING_PARAMS.forEach((key) => {
			const maybeValue = currentSearchParams.get(key);
			if (maybeValue) destinationUrl.searchParams.set(key, maybeValue);
		});
		return `${destinationUrl.pathname}${destinationUrl.search}`;
	}
	/**
	*
	*/
	function match(path, index) {
		const pathToMatch = path ?? (index && "/");
		if (!pathToMatch) throw new Error("[clerk] router.match() requires either a path to match, or the index flag must be set to true.");
		return normalizePath(`${normalizedBasePath}${normalizePath(pathToMatch)}`) === normalizePath(router.pathname());
	}
	/**
	*
	*/
	function child(childBasePath) {
		return createClerkRouter(router, `${normalizedBasePath}${normalizePath(childBasePath)}`);
	}
	/**
	*
	*/
	function push(path) {
		const destinationUrl = makeDestinationUrlWithPreservedQueryParameters(path);
		return router.push(destinationUrl);
	}
	/**
	*
	*/
	function replace(path) {
		const destinationUrl = makeDestinationUrlWithPreservedQueryParameters(path);
		return router.replace(destinationUrl);
	}
	/**
	*
	*/
	function shallowPush(path) {
		const destinationUrl = makeDestinationUrlWithPreservedQueryParameters(path);
		return router.shallowPush(destinationUrl);
	}
	/**
	*
	*/
	function pathname() {
		return router.pathname();
	}
	/**
	*
	*/
	function searchParams() {
		return router.searchParams();
	}
	return {
		makeDestinationUrlWithPreservedQueryParameters,
		child,
		match,
		mode: router.mode,
		name: router.name,
		push,
		replace,
		shallowPush,
		pathname,
		searchParams,
		basePath: normalizedBasePath
	};
}

//#endregion
//#region src/router/react.tsx
const ClerkHostRouterContext = createContext(null);
const ClerkRouterContext = createContext(null);
function useClerkHostRouter() {
	const ctx = useContext(ClerkHostRouterContext);
	if (!ctx) throw new Error("clerk: Unable to locate ClerkHostRouter, make sure this is rendered within `<ClerkHostRouterContext.Provider>`.");
	return ctx;
}
function useClerkRouter() {
	const ctx = useContext(ClerkRouterContext);
	if (!ctx) throw new Error("clerk: Unable to locate ClerkRouter, make sure this is rendered within `<Router>`.");
	return ctx;
}
/**
* Construct a Clerk Router using the provided host router. The router instance is accessible using `useClerkRouter()`.
*/
function Router({ basePath, children, router }) {
	const hostRouter = useClerkHostRouter();
	const clerkRouter = createClerkRouter(router ?? hostRouter, basePath);
	return /* @__PURE__ */ React.createElement(ClerkRouterContext.Provider, { value: clerkRouter }, children);
}
/**
* Used to conditionally render its children based on whether or not the current path matches the provided path.
*/
function Route({ path, children, index }) {
	const parentRouter = useClerkRouter();
	if (!path && !index) return children;
	if (!parentRouter?.match(path, index)) return null;
	return children;
}

//#endregion
export { ClerkHostRouterContext, ClerkRouterContext, Route, Router, createClerkRouter, useClerkHostRouter, useClerkRouter };
//# sourceMappingURL=router.mjs.map