import "../constants-ByUssRbE.mjs";
import "../isomorphicAtob-DybBXGFR.mjs";
import "../isomorphicBtoa-Dr7WubZv.mjs";
import "../keys-YNv6yjKk.mjs";
import { isReverificationHint, reverificationError } from "../authorization-errors-CS1pNy8i.mjs";
import { validateReverificationConfig } from "../authorization-D2ans7vW.mjs";
import { ClerkRuntimeError, isClerkAPIResponseError } from "../error-Dl9xmUf3.mjs";
import "../noop-B3MbDAfb.mjs";
import { createDeferredPromise } from "../createDeferredPromise-CjYZzUuU.mjs";
import "../underscore-DjQrhefX.mjs";
import { getCurrentOrganizationMembership } from "../organization-BqxdOtRG.mjs";
import { eventMethodCalled } from "../telemetry-wqMDWlvR.mjs";
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import useSWR, { SWRConfig, useSWRConfig } from "swr";
import useSWRInfinite from "swr/infinite";
import { dequal } from "dequal";
import useSWRMutation from "swr/mutation";

//#region src/react/hooks/createContextAndHook.ts
/**
* Assert that the context value exists, otherwise throw an error.
*
* @internal
*/
function assertContextExists(contextVal, msgOrCtx) {
	if (!contextVal) throw typeof msgOrCtx === "string" ? new Error(msgOrCtx) : /* @__PURE__ */ new Error(`${msgOrCtx.displayName} not found`);
}
/**
* Create and return a Context and two hooks that return the context value.
* The Context type is derived from the type passed in by the user.
*
* The first hook returned guarantees that the context exists so the returned value is always `CtxValue`
* The second hook makes no guarantees, so the returned value can be `CtxValue | undefined`
*
* @internal
*/
const createContextAndHook = (displayName, options) => {
	const { assertCtxFn = assertContextExists } = options || {};
	const Ctx = React.createContext(void 0);
	Ctx.displayName = displayName;
	const useCtx = () => {
		const ctx = React.useContext(Ctx);
		assertCtxFn(ctx, `${displayName} not found`);
		return ctx.value;
	};
	const useCtxWithoutGuarantee = () => {
		const ctx = React.useContext(Ctx);
		return ctx ? ctx.value : {};
	};
	return [
		Ctx,
		useCtx,
		useCtxWithoutGuarantee
	];
};

//#endregion
//#region src/react/providers/SWRConfigCompat.swr.tsx
/**
* @internal
*/
function SWRConfigCompat({ swrConfig, children }) {
	return /* @__PURE__ */ React.createElement(SWRConfig, { value: swrConfig }, children);
}

//#endregion
//#region src/react/contexts.tsx
const [ClerkInstanceContext, useClerkInstanceContext] = createContextAndHook("ClerkInstanceContext");
const [UserContext, useUserContext] = createContextAndHook("UserContext");
const [ClientContext, useClientContext] = createContextAndHook("ClientContext");
const [SessionContext, useSessionContext] = createContextAndHook("SessionContext");
const OptionsContext = React.createContext({});
const [CheckoutContext, useCheckoutContext] = createContextAndHook("CheckoutContext");
const __experimental_CheckoutProvider = ({ children,...rest }) => {
	return /* @__PURE__ */ React.createElement(CheckoutContext.Provider, { value: { value: rest } }, children);
};
/**
* @internal
*/
function useOptionsContext() {
	const context = React.useContext(OptionsContext);
	if (context === void 0) throw new Error("useOptions must be used within an OptionsContext");
	return context;
}
const [OrganizationContextInternal, useOrganizationContext] = createContextAndHook("OrganizationContext");
const OrganizationProvider = ({ children, organization, swrConfig }) => {
	return /* @__PURE__ */ React.createElement(SWRConfigCompat, { swrConfig }, /* @__PURE__ */ React.createElement(OrganizationContextInternal.Provider, { value: { value: { organization } } }, children));
};
/**
* @internal
*/
function useAssertWrappedByClerkProvider(displayNameOrFn) {
	if (!React.useContext(ClerkInstanceContext)) {
		if (typeof displayNameOrFn === "function") {
			displayNameOrFn();
			return;
		}
		throw new Error(`${displayNameOrFn} can only be used within the <ClerkProvider /> component.

Possible fixes:
1. Ensure that the <ClerkProvider /> is correctly wrapping your application where this component is used.
2. Check for multiple versions of the \`@clerk/shared\` package in your project. Use a tool like \`npm ls @clerk/shared\` to identify multiple versions, and update your dependencies to only rely on one.

Learn more: https://clerk.com/docs/components/clerk-provider`.trim());
	}
}

//#endregion
//#region src/react/stable-keys.ts
const USER_MEMBERSHIPS_KEY = "userMemberships";
const USER_INVITATIONS_KEY = "userInvitations";
const USER_SUGGESTIONS_KEY = "userSuggestions";
const DOMAINS_KEY = "domains";
const MEMBERSHIP_REQUESTS_KEY = "membershipRequests";
const MEMBERSHIPS_KEY = "memberships";
const INVITATIONS_KEY = "invitations";
const API_KEYS_KEY = "apiKeys";
const PLANS_KEY = "billing-plans";
const SUBSCRIPTION_KEY = "billing-subscription";
const PAYMENT_METHODS_KEY = "billing-payment-methods";
const PAYMENT_ATTEMPTS_KEY = "billing-payment-attempts";
const STATEMENTS_KEY = "billing-statements";
const STABLE_KEYS = {
	USER_MEMBERSHIPS_KEY,
	USER_INVITATIONS_KEY,
	USER_SUGGESTIONS_KEY,
	DOMAINS_KEY,
	MEMBERSHIP_REQUESTS_KEY,
	MEMBERSHIPS_KEY,
	INVITATIONS_KEY,
	PLANS_KEY,
	SUBSCRIPTION_KEY,
	PAYMENT_METHODS_KEY,
	PAYMENT_ATTEMPTS_KEY,
	STATEMENTS_KEY,
	API_KEYS_KEY
};
/**
* Internal stable keys for queries only used by our UI components.
* These keys are not used by the hooks themselves.
*/
const PAYMENT_ATTEMPT_KEY = "billing-payment-attempt";
const BILLING_PLANS_KEY = "billing-plan";
const BILLING_STATEMENTS_KEY = "billing-statement";
const INTERNAL_STABLE_KEYS = {
	PAYMENT_ATTEMPT_KEY,
	BILLING_PLANS_KEY,
	BILLING_STATEMENTS_KEY
};

//#endregion
//#region src/react/hooks/createCacheKeys.ts
/**
* @internal
*/
function createCacheKeys(params) {
	return {
		queryKey: [
			params.stablePrefix,
			params.authenticated,
			params.tracked,
			params.untracked
		],
		invalidationKey: [
			params.stablePrefix,
			params.authenticated,
			params.tracked
		],
		stableKey: params.stablePrefix,
		authenticated: params.authenticated
	};
}
/**
* @internal
*/
function toSWRQuery(keys) {
	const { queryKey } = keys;
	return {
		type: queryKey[0],
		...queryKey[2],
		...queryKey[3].args
	};
}

//#endregion
//#region src/react/hooks/usePagesOrInfinite.shared.ts
/**
* A hook that safely merges user-provided pagination options with default values.
* It caches initial pagination values (page and size) until component unmount to prevent unwanted rerenders.
*
* @internal
*
* @example
* ```typescript
* // Example 1: With user-provided options
* const userOptions = { initialPage: 2, pageSize: 20, infinite: true };
* const defaults = { initialPage: 1, pageSize: 10, infinite: false };
* useWithSafeValues(userOptions, defaults);
* // Returns { initialPage: 2, pageSize: 20, infinite: true }
*
* // Example 2: With boolean true (use defaults)
* const params = true;
* const defaults = { initialPage: 1, pageSize: 10, infinite: false };
* useWithSafeValues(params, defaults);
* // Returns { initialPage: 1, pageSize: 10, infinite: false }
*
* // Example 3: With undefined options (fallback to defaults)
* const params = undefined;
* const defaults = { initialPage: 1, pageSize: 10, infinite: false };
* useWithSafeValues(params, defaults);
* // Returns { initialPage: 1, pageSize: 10, infinite: false }
* ```
*/
const useWithSafeValues = (params, defaultValues) => {
	const shouldUseDefaults = typeof params === "boolean" && params;
	const initialPageRef = useRef(shouldUseDefaults ? defaultValues.initialPage : params?.initialPage ?? defaultValues.initialPage);
	const pageSizeRef = useRef(shouldUseDefaults ? defaultValues.pageSize : params?.pageSize ?? defaultValues.pageSize);
	const newObj = {};
	for (const key of Object.keys(defaultValues)) newObj[key] = shouldUseDefaults ? defaultValues[key] : params?.[key] ?? defaultValues[key];
	return {
		...newObj,
		initialPage: initialPageRef.current,
		pageSize: pageSizeRef.current
	};
};
/**
* Returns an object containing only the keys from the first object that are not present in the second object.
* Useful for extracting unique parameters that should be passed to a request while excluding common cache keys.
*
* @internal
*
* @example
* ```typescript
* // Example 1: Basic usage
* const obj1 = { name: 'John', age: 30, city: 'NY' };
* const obj2 = { name: 'John', age: 30 };
* getDifferentKeys(obj1, obj2); // Returns { city: 'NY' }
*
* // Example 2: With cache keys
* const requestParams = { page: 1, limit: 10, userId: '123' };
* const cacheKeys = { userId: '123' };
* getDifferentKeys(requestParams, cacheKeys); // Returns { page: 1, limit: 10 }
* ```
*/
function getDifferentKeys(obj1, obj2) {
	const keysSet = new Set(Object.keys(obj2));
	const differentKeysObject = {};
	for (const key1 of Object.keys(obj1)) if (!keysSet.has(key1)) differentKeysObject[key1] = obj1[key1];
	return differentKeysObject;
}

//#endregion
//#region src/react/hooks/usePreviousValue.ts
/**
* A hook that retains the previous value of a primitive type.
* It uses a ref to prevent causing unnecessary re-renders.
*
* @internal
*
* @example
* ```
* Render 1: value = 'A' → returns null
* Render 2: value = 'B' → returns 'A'
* Render 3: value = 'B' → returns 'A'
* Render 4: value = 'B' → returns 'A'
* Render 5: value = 'C' → returns 'B'
* ```
*/
function usePreviousValue(value) {
	const currentRef = useRef(value);
	const previousRef = useRef(null);
	if (currentRef.current !== value) {
		previousRef.current = currentRef.current;
		currentRef.current = value;
	}
	return previousRef.current;
}

//#endregion
//#region src/react/hooks/usePagesOrInfinite.swr.tsx
const cachingSWROptions = {
	dedupingInterval: 1e3 * 60,
	focusThrottleInterval: 1e3 * 60 * 2
};
const cachingSWRInfiniteOptions = {
	...cachingSWROptions,
	revalidateFirstPage: false
};
/**
* A flexible pagination hook that supports both traditional pagination and infinite loading.
* It provides a unified API for handling paginated data fetching, with built-in caching through SWR.
* The hook can operate in two modes:
* - Traditional pagination: Fetches one page at a time with page navigation
* - Infinite loading: Accumulates data as more pages are loaded.
*
* Features:
* - Cache management with SWR
* - Loading and error states
* - Page navigation helpers
* - Data revalidation and updates
* - Support for keeping previous data while loading.
*
* @internal
*/
const usePagesOrInfinite = (params) => {
	const { fetcher, config, keys } = params;
	const [paginatedPage, setPaginatedPage] = useState(config.initialPage ?? 1);
	const initialPageRef = useRef(config.initialPage ?? 1);
	const pageSizeRef = useRef(config.pageSize ?? 10);
	const enabled = config.enabled ?? true;
	const cacheMode = config.__experimental_mode === "cache";
	const triggerInfinite = config.infinite ?? false;
	const keepPreviousData = config.keepPreviousData ?? false;
	const isSignedIn = config.isSignedIn;
	const pagesCacheKey = {
		...toSWRQuery(keys),
		initialPage: paginatedPage,
		pageSize: pageSizeRef.current
	};
	const previousIsSignedIn = usePreviousValue(isSignedIn);
	const shouldFetch = !triggerInfinite && enabled && (!cacheMode ? !!fetcher : true);
	const { data: swrData, isValidating: swrIsValidating, isLoading: swrIsLoading, error: swrError, mutate: swrMutate } = useSWR(typeof isSignedIn === "boolean" ? previousIsSignedIn === true && isSignedIn === false ? pagesCacheKey : isSignedIn ? shouldFetch ? pagesCacheKey : null : null : shouldFetch ? pagesCacheKey : null, !cacheMode && !!fetcher ? (cacheKeyParams) => {
		if (isSignedIn === false || shouldFetch === false) return null;
		return fetcher(getDifferentKeys(cacheKeyParams, {
			type: keys.queryKey[0],
			...keys.queryKey[2]
		}));
	} : null, {
		keepPreviousData,
		...cachingSWROptions
	});
	const { data: swrInfiniteData, isLoading: swrInfiniteIsLoading, isValidating: swrInfiniteIsValidating, error: swrInfiniteError, size, setSize, mutate: swrInfiniteMutate } = useSWRInfinite((pageIndex) => {
		if (!triggerInfinite || !enabled || isSignedIn === false) return null;
		return {
			...toSWRQuery(keys),
			initialPage: initialPageRef.current + pageIndex,
			pageSize: pageSizeRef.current
		};
	}, (cacheKeyParams) => {
		const requestParams = getDifferentKeys(cacheKeyParams, {
			type: keys.queryKey[0],
			...keys.queryKey[2]
		});
		return fetcher?.(requestParams);
	}, cachingSWRInfiniteOptions);
	const page = useMemo(() => {
		if (triggerInfinite) return size;
		return paginatedPage;
	}, [
		triggerInfinite,
		size,
		paginatedPage
	]);
	const fetchPage = useCallback((numberOrgFn) => {
		if (triggerInfinite) {
			setSize(numberOrgFn);
			return;
		}
		return setPaginatedPage(numberOrgFn);
	}, [setSize, triggerInfinite]);
	const data = useMemo(() => {
		if (triggerInfinite) return swrInfiniteData?.map((a) => a?.data).flat() ?? [];
		return swrData?.data ?? [];
	}, [
		triggerInfinite,
		swrData,
		swrInfiniteData
	]);
	const count = useMemo(() => {
		if (triggerInfinite) return swrInfiniteData?.[swrInfiniteData?.length - 1]?.total_count || 0;
		return swrData?.total_count ?? 0;
	}, [
		triggerInfinite,
		swrData,
		swrInfiniteData
	]);
	const isLoading = triggerInfinite ? swrInfiniteIsLoading : swrIsLoading;
	const isFetching = triggerInfinite ? swrInfiniteIsValidating : swrIsValidating;
	const error = (triggerInfinite ? swrInfiniteError : swrError) ?? null;
	const isError = !!error;
	const fetchNext = useCallback(() => {
		fetchPage((n) => Math.max(0, n + 1));
	}, [fetchPage]);
	const fetchPrevious = useCallback(() => {
		fetchPage((n) => Math.max(0, n - 1));
	}, [fetchPage]);
	const offsetCount = (initialPageRef.current - 1) * pageSizeRef.current;
	return {
		data,
		count,
		error,
		isLoading,
		isFetching,
		isError,
		page,
		pageCount: Math.ceil((count - offsetCount) / pageSizeRef.current),
		fetchPage,
		fetchNext,
		fetchPrevious,
		hasNextPage: count - offsetCount * pageSizeRef.current > page * pageSizeRef.current,
		hasPreviousPage: (page - 1) * pageSizeRef.current > offsetCount * pageSizeRef.current,
		revalidate: triggerInfinite ? () => swrInfiniteMutate() : () => swrMutate(),
		setData: triggerInfinite ? (value) => swrInfiniteMutate(value, { revalidate: false }) : (value) => swrMutate(value, { revalidate: false })
	};
};

//#endregion
//#region src/react/hooks/useAPIKeys.swr.tsx
/**
* @internal
*
* The `useAPIKeys()` hook provides access to paginated API keys for the current user or organization.
*
* @example
* ### Basic usage with default pagination
*
* ```tsx
* const { data, isLoading, page, pageCount, fetchNext, fetchPrevious } = useAPIKeys({
*   subject: 'user_123',
*   pageSize: 10,
*   initialPage: 1,
* });
* ```
*
* @example
* ### With search query
*
* ```tsx
* const [searchValue, setSearchValue] = useState('');
* const debouncedSearch = useDebounce(searchValue, 500);
*
* const { data, isLoading } = useAPIKeys({
*   subject: 'user_123',
*   query: debouncedSearch.trim(),
*   pageSize: 10,
* });
* ```
*
* @example
* ### Infinite scroll
*
* ```tsx
* const { data, isLoading, fetchNext, hasNextPage } = useAPIKeys({
*   subject: 'user_123',
*   infinite: true,
* });
* ```
*/
function useAPIKeys(params) {
	useAssertWrappedByClerkProvider("useAPIKeys");
	const safeValues = useWithSafeValues(params, {
		initialPage: 1,
		pageSize: 10,
		keepPreviousData: false,
		infinite: false,
		subject: "",
		query: "",
		enabled: true
	});
	const clerk = useClerkInstanceContext();
	clerk.telemetry?.record(eventMethodCalled("useAPIKeys"));
	const hookParams = {
		initialPage: safeValues.initialPage,
		pageSize: safeValues.pageSize,
		...safeValues.subject ? { subject: safeValues.subject } : {},
		...safeValues.query ? { query: safeValues.query } : {}
	};
	const isEnabled = (safeValues.enabled ?? true) && clerk.loaded;
	const result = usePagesOrInfinite({
		fetcher: clerk.apiKeys?.getAll ? (params$1) => clerk.apiKeys.getAll({
			...params$1,
			subject: safeValues.subject
		}) : void 0,
		config: {
			keepPreviousData: safeValues.keepPreviousData,
			infinite: safeValues.infinite,
			enabled: isEnabled,
			isSignedIn: Boolean(clerk.user),
			initialPage: safeValues.initialPage,
			pageSize: safeValues.pageSize
		},
		keys: createCacheKeys({
			stablePrefix: STABLE_KEYS.API_KEYS_KEY,
			authenticated: Boolean(clerk.user),
			tracked: { subject: safeValues.subject },
			untracked: { args: hookParams }
		})
	});
	const { mutate } = useSWRConfig();
	const invalidateAll = useCallback(() => {
		return mutate((key) => {
			if (!key || typeof key !== "object") return false;
			return "type" in key && key.type === "apiKeys" && "subject" in key && key.subject === safeValues.subject;
		});
	}, [mutate, safeValues.subject]);
	return {
		...result,
		revalidate: invalidateAll
	};
}

//#endregion
//#region src/react/hooks/useClerk.ts
/**
* > [!WARNING]
* > This hook should only be used for advanced use cases, such as building a completely custom OAuth flow or as an escape hatch to access to the `Clerk` object.
*
* The `useClerk()` hook provides access to the [`Clerk`](https://clerk.com/docs/reference/javascript/clerk) object, allowing you to build alternatives to any Clerk Component.
*
* @function
*
* @returns The `useClerk()` hook returns the `Clerk` object, which includes all the methods and properties listed in the [`Clerk` reference](https://clerk.com/docs/reference/javascript/clerk).
*
* @example
*
* The following example uses the `useClerk()` hook to access the `clerk` object. The `clerk` object is used to call the [`openSignIn()`](https://clerk.com/docs/reference/javascript/clerk#sign-in) method to open the sign-in modal.
*
* <Tabs items='React,Next.js'>
* <Tab>
*
* ```tsx {{ filename: 'src/Home.tsx' }}
* import { useClerk } from '@clerk/clerk-react'
*
* export default function Home() {
*   const clerk = useClerk()
*
*   return <button onClick={() => clerk.openSignIn({})}>Sign in</button>
* }
* ```
*
* </Tab>
* <Tab>
*
* {@include ../../../docs/use-clerk.md#nextjs-01}
*
* </Tab>
* </Tabs>
*/
const useClerk = () => {
	useAssertWrappedByClerkProvider("useClerk");
	return useClerkInstanceContext();
};

//#endregion
//#region src/react/hooks/useAttemptToEnableOrganizations.ts
/**
* Attempts to enable the organizations environment setting for a given caller
*
* @internal
*/
function useAttemptToEnableOrganizations(caller) {
	const clerk = useClerk();
	const hasAttempted = useRef(false);
	useEffect(() => {
		if (hasAttempted.current) return;
		hasAttempted.current = true;
		clerk.__internal_attemptToEnableEnvironmentSetting?.({
			for: "organizations",
			caller
		});
	}, [clerk, caller]);
}

//#endregion
//#region src/react/hooks/useOrganization.tsx
const undefinedPaginatedResource$1 = {
	data: void 0,
	count: void 0,
	error: void 0,
	isLoading: false,
	isFetching: false,
	isError: false,
	page: void 0,
	pageCount: void 0,
	fetchPage: void 0,
	fetchNext: void 0,
	fetchPrevious: void 0,
	hasNextPage: false,
	hasPreviousPage: false,
	revalidate: void 0,
	setData: void 0
};
/**
* The `useOrganization()` hook retrieves attributes of the currently Active Organization.
*
* @example
* ### Expand and paginate attributes
*
* To keep network usage to a minimum, developers are required to opt-in by specifying which resource they need to fetch and paginate through. By default, the `memberships`, `invitations`, `membershipRequests`, and `domains` attributes are not populated. You must pass `true` or an object with the desired properties to fetch and paginate the data.
*
* ```tsx
* // invitations.data will never be populated.
* const { invitations } = useOrganization()
*
* // Use default values to fetch invitations, such as initialPage = 1 and pageSize = 10
* const { invitations } = useOrganization({
*   invitations: true,
* })
*
* // Pass your own values to fetch invitations
* const { invitations } = useOrganization({
*   invitations: {
*     pageSize: 20,
*     initialPage: 2, // skips the first page
*   },
* })
*
* // Aggregate pages in order to render an infinite list
* const { invitations } = useOrganization({
*   invitations: {
*     infinite: true,
*   },
* })
* ```
*
* @example
* ### Infinite pagination
*
* The following example demonstrates how to use the `infinite` property to fetch and append new data to the existing list. The `memberships` attribute will be populated with the first page of the Organization's memberships. When the "Load more" button is clicked, the `fetchNext` helper function will be called to append the next page of memberships to the list.
*
* ```tsx
* import { useOrganization } from '@clerk/clerk-react'
*
* export default function MemberList() {
*   const { memberships } = useOrganization({
*     memberships: {
*       infinite: true, // Append new data to the existing list
*       keepPreviousData: true, // Persist the cached data until the new data has been fetched
*     },
*   })
*
*   if (!memberships) {
*     // Handle loading state
*     return null
*   }
*
*   return (
*     <div>
*       <h2>Organization members</h2>
*       <ul>
*         {memberships.data?.map((membership) => (
*           <li key={membership.id}>
*             {membership.publicUserData.firstName} {membership.publicUserData.lastName} <
*             {membership.publicUserData.identifier}> :: {membership.role}
*           </li>
*         ))}
*       </ul>
*
*       <button
*         disabled={!memberships.hasNextPage} // Disable the button if there are no more available pages to be fetched
*         onClick={memberships.fetchNext}
*       >
*         Load more
*       </button>
*     </div>
*   )
* }
* ```
*
* @example
* ### Simple pagination
*
* The following example demonstrates how to use the `fetchPrevious` and `fetchNext` helper functions to paginate through the data. The `memberships` attribute will be populated with the first page of the Organization's memberships. When the "Previous page" or "Next page" button is clicked, the `fetchPrevious` or `fetchNext` helper function will be called to fetch the previous or next page of memberships.
*
* Notice the difference between this example's pagination and the infinite pagination example above.
*
* ```tsx
* import { useOrganization } from '@clerk/clerk-react'
*
* export default function MemberList() {
*   const { memberships } = useOrganization({
*     memberships: {
*       keepPreviousData: true, // Persist the cached data until the new data has been fetched
*     },
*   })
*
*   if (!memberships) {
*     // Handle loading state
*     return null
*   }
*
*   return (
*     <div>
*       <h2>Organization members</h2>
*       <ul>
*         {memberships.data?.map((membership) => (
*           <li key={membership.id}>
*             {membership.publicUserData.firstName} {membership.publicUserData.lastName} <
*             {membership.publicUserData.identifier}> :: {membership.role}
*           </li>
*         ))}
*       </ul>
*
*       <button disabled={!memberships.hasPreviousPage} onClick={memberships.fetchPrevious}>
*         Previous page
*       </button>
*
*       <button disabled={!memberships.hasNextPage} onClick={memberships.fetchNext}>
*         Next page
*       </button>
*     </div>
*   )
* }
* ```
*/
function useOrganization(params) {
	const { domains: domainListParams, membershipRequests: membershipRequestsListParams, memberships: membersListParams, invitations: invitationsListParams } = params || {};
	useAssertWrappedByClerkProvider("useOrganization");
	useAttemptToEnableOrganizations("useOrganization");
	const { organization } = useOrganizationContext();
	const session = useSessionContext();
	const domainSafeValues = useWithSafeValues(domainListParams, {
		initialPage: 1,
		pageSize: 10,
		keepPreviousData: false,
		infinite: false,
		enrollmentMode: void 0
	});
	const membershipRequestSafeValues = useWithSafeValues(membershipRequestsListParams, {
		initialPage: 1,
		pageSize: 10,
		status: "pending",
		keepPreviousData: false,
		infinite: false
	});
	const membersSafeValues = useWithSafeValues(membersListParams, {
		initialPage: 1,
		pageSize: 10,
		role: void 0,
		keepPreviousData: false,
		infinite: false,
		query: void 0
	});
	const invitationsSafeValues = useWithSafeValues(invitationsListParams, {
		initialPage: 1,
		pageSize: 10,
		status: ["pending"],
		keepPreviousData: false,
		infinite: false
	});
	const clerk = useClerkInstanceContext();
	clerk.telemetry?.record(eventMethodCalled("useOrganization"));
	const domainParams = typeof domainListParams === "undefined" ? void 0 : {
		initialPage: domainSafeValues.initialPage,
		pageSize: domainSafeValues.pageSize,
		enrollmentMode: domainSafeValues.enrollmentMode
	};
	const membershipRequestParams = typeof membershipRequestsListParams === "undefined" ? void 0 : {
		initialPage: membershipRequestSafeValues.initialPage,
		pageSize: membershipRequestSafeValues.pageSize,
		status: membershipRequestSafeValues.status
	};
	const membersParams = typeof membersListParams === "undefined" ? void 0 : {
		initialPage: membersSafeValues.initialPage,
		pageSize: membersSafeValues.pageSize,
		role: membersSafeValues.role,
		query: membersSafeValues.query
	};
	const invitationsParams = typeof invitationsListParams === "undefined" ? void 0 : {
		initialPage: invitationsSafeValues.initialPage,
		pageSize: invitationsSafeValues.pageSize,
		status: invitationsSafeValues.status
	};
	const domains = usePagesOrInfinite({
		fetcher: organization?.getDomains,
		config: {
			keepPreviousData: domainSafeValues.keepPreviousData,
			infinite: domainSafeValues.infinite,
			enabled: !!domainParams,
			isSignedIn: Boolean(organization),
			initialPage: domainSafeValues.initialPage,
			pageSize: domainSafeValues.pageSize
		},
		keys: createCacheKeys({
			stablePrefix: STABLE_KEYS.DOMAINS_KEY,
			authenticated: Boolean(organization),
			tracked: { organizationId: organization?.id },
			untracked: { args: domainParams }
		})
	});
	const membershipRequests = usePagesOrInfinite({
		fetcher: organization?.getMembershipRequests,
		config: {
			keepPreviousData: membershipRequestSafeValues.keepPreviousData,
			infinite: membershipRequestSafeValues.infinite,
			enabled: !!membershipRequestParams,
			isSignedIn: Boolean(organization),
			initialPage: membershipRequestSafeValues.initialPage,
			pageSize: membershipRequestSafeValues.pageSize
		},
		keys: createCacheKeys({
			stablePrefix: STABLE_KEYS.MEMBERSHIP_REQUESTS_KEY,
			authenticated: Boolean(organization),
			tracked: { organizationId: organization?.id },
			untracked: { args: membershipRequestParams }
		})
	});
	const memberships = usePagesOrInfinite({
		fetcher: organization?.getMemberships,
		config: {
			keepPreviousData: membersSafeValues.keepPreviousData,
			infinite: membersSafeValues.infinite,
			enabled: !!membersParams,
			isSignedIn: Boolean(organization),
			initialPage: membersSafeValues.initialPage,
			pageSize: membersSafeValues.pageSize
		},
		keys: createCacheKeys({
			stablePrefix: STABLE_KEYS.MEMBERSHIPS_KEY,
			authenticated: Boolean(organization),
			tracked: { organizationId: organization?.id },
			untracked: { args: membersParams }
		})
	});
	const invitations = usePagesOrInfinite({
		fetcher: organization?.getInvitations,
		config: {
			keepPreviousData: invitationsSafeValues.keepPreviousData,
			infinite: invitationsSafeValues.infinite,
			enabled: !!invitationsParams,
			isSignedIn: Boolean(organization),
			initialPage: invitationsSafeValues.initialPage,
			pageSize: invitationsSafeValues.pageSize
		},
		keys: createCacheKeys({
			stablePrefix: STABLE_KEYS.INVITATIONS_KEY,
			authenticated: Boolean(organization),
			tracked: { organizationId: organization?.id },
			untracked: { args: invitationsParams }
		})
	});
	if (organization === void 0) return {
		isLoaded: false,
		organization: void 0,
		membership: void 0,
		domains: undefinedPaginatedResource$1,
		membershipRequests: undefinedPaginatedResource$1,
		memberships: undefinedPaginatedResource$1,
		invitations: undefinedPaginatedResource$1
	};
	if (organization === null) return {
		isLoaded: true,
		organization: null,
		membership: null,
		domains: null,
		membershipRequests: null,
		memberships: null,
		invitations: null
	};
	/** In SSR context we include only the organization object when loadOrg is set to true. */
	if (!clerk.loaded && organization) return {
		isLoaded: true,
		organization,
		membership: void 0,
		domains: undefinedPaginatedResource$1,
		membershipRequests: undefinedPaginatedResource$1,
		memberships: undefinedPaginatedResource$1,
		invitations: undefinedPaginatedResource$1
	};
	return {
		isLoaded: clerk.loaded,
		organization,
		membership: getCurrentOrganizationMembership(session.user.organizationMemberships, organization.id),
		domains,
		membershipRequests,
		memberships,
		invitations
	};
}

//#endregion
//#region src/react/hooks/useOrganizationList.tsx
const undefinedPaginatedResource = {
	data: void 0,
	count: void 0,
	error: void 0,
	isLoading: false,
	isFetching: false,
	isError: false,
	page: void 0,
	pageCount: void 0,
	fetchPage: void 0,
	fetchNext: void 0,
	fetchPrevious: void 0,
	hasNextPage: false,
	hasPreviousPage: false,
	revalidate: void 0,
	setData: void 0
};
/**
* The `useOrganizationList()` hook provides access to the current user's organization memberships, invitations, and suggestions. It also includes methods for creating new organizations and managing the active organization.
*
* @example
* ### Expanding and paginating attributes
*
* To keep network usage to a minimum, developers are required to opt-in by specifying which resource they need to fetch and paginate through. So by default, the `userMemberships`, `userInvitations`, and `userSuggestions` attributes are not populated. You must pass true or an object with the desired properties to fetch and paginate the data.
*
* ```tsx
* // userMemberships.data will never be populated
* const { userMemberships } = useOrganizationList()
*
* // Use default values to fetch userMemberships, such as initialPage = 1 and pageSize = 10
* const { userMemberships } = useOrganizationList({
*   userMemberships: true,
* })
*
* // Pass your own values to fetch userMemberships
* const { userMemberships } = useOrganizationList({
*   userMemberships: {
*     pageSize: 20,
*     initialPage: 2, // skips the first page
*   },
* })
*
* // Aggregate pages in order to render an infinite list
* const { userMemberships } = useOrganizationList({
*   userMemberships: {
*     infinite: true,
*   },
* })
* ```
*
* @example
* ### Infinite pagination
*
* The following example demonstrates how to use the `infinite` property to fetch and append new data to the existing list. The `userMemberships` attribute will be populated with the first page of the user's Organization memberships. When the "Load more" button is clicked, the `fetchNext` helper function will be called to append the next page of memberships to the list.
*
* ```tsx {{ filename: 'src/components/JoinedOrganizations.tsx' }}
* import { useOrganizationList } from '@clerk/clerk-react'
* import React from 'react'
*
* const JoinedOrganizations = () => {
*   const { isLoaded, setActive, userMemberships } = useOrganizationList({
*     userMemberships: {
*       infinite: true,
*     },
*   })
*
*   if (!isLoaded) {
*     return <>Loading</>
*   }
*
*   return (
*     <>
*       <ul>
*         {userMemberships.data?.map((mem) => (
*           <li key={mem.id}>
*             <span>{mem.organization.name}</span>
*             <button onClick={() => setActive({ organization: mem.organization.id })}>Select</button>
*           </li>
*         ))}
*       </ul>
*
*       <button disabled={!userMemberships.hasNextPage} onClick={() => userMemberships.fetchNext()}>
*         Load more
*       </button>
*     </>
*   )
* }
*
* export default JoinedOrganizations
* ```
*
* @example
* ### Simple pagination
*
* The following example demonstrates how to use the `fetchPrevious` and `fetchNext` helper functions to paginate through the data. The `userInvitations` attribute will be populated with the first page of invitations. When the "Previous page" or "Next page" button is clicked, the `fetchPrevious` or `fetchNext` helper function will be called to fetch the previous or next page of invitations.
*
* Notice the difference between this example's pagination and the infinite pagination example above.
*
* ```tsx {{ filename: 'src/components/UserInvitationsTable.tsx' }}
* import { useOrganizationList } from '@clerk/clerk-react'
* import React from 'react'
*
* const UserInvitationsTable = () => {
*   const { isLoaded, userInvitations } = useOrganizationList({
*     userInvitations: {
*       infinite: true,
*       keepPreviousData: true,
*     },
*   })
*
*   if (!isLoaded || userInvitations.isLoading) {
*     return <>Loading</>
*   }
*
*   return (
*     <>
*       <table>
*         <thead>
*           <tr>
*             <th>Email</th>
*             <th>Org name</th>
*           </tr>
*         </thead>
*
*         <tbody>
*           {userInvitations.data?.map((inv) => (
*             <tr key={inv.id}>
*               <th>{inv.emailAddress}</th>
*               <th>{inv.publicOrganizationData.name}</th>
*             </tr>
*           ))}
*         </tbody>
*       </table>
*
*       <button disabled={!userInvitations.hasPreviousPage} onClick={userInvitations.fetchPrevious}>
*         Prev
*       </button>
*       <button disabled={!userInvitations.hasNextPage} onClick={userInvitations.fetchNext}>
*         Next
*       </button>
*     </>
*   )
* }
*
* export default UserInvitationsTable
* ```
*/
function useOrganizationList(params) {
	const { userMemberships, userInvitations, userSuggestions } = params || {};
	useAssertWrappedByClerkProvider("useOrganizationList");
	useAttemptToEnableOrganizations("useOrganizationList");
	const userMembershipsSafeValues = useWithSafeValues(userMemberships, {
		initialPage: 1,
		pageSize: 10,
		keepPreviousData: false,
		infinite: false
	});
	const userInvitationsSafeValues = useWithSafeValues(userInvitations, {
		initialPage: 1,
		pageSize: 10,
		status: "pending",
		keepPreviousData: false,
		infinite: false
	});
	const userSuggestionsSafeValues = useWithSafeValues(userSuggestions, {
		initialPage: 1,
		pageSize: 10,
		status: "pending",
		keepPreviousData: false,
		infinite: false
	});
	const clerk = useClerkInstanceContext();
	const user = useUserContext();
	clerk.telemetry?.record(eventMethodCalled("useOrganizationList"));
	const userMembershipsParams = typeof userMemberships === "undefined" ? void 0 : {
		initialPage: userMembershipsSafeValues.initialPage,
		pageSize: userMembershipsSafeValues.pageSize
	};
	const userInvitationsParams = typeof userInvitations === "undefined" ? void 0 : {
		initialPage: userInvitationsSafeValues.initialPage,
		pageSize: userInvitationsSafeValues.pageSize,
		status: userInvitationsSafeValues.status
	};
	const userSuggestionsParams = typeof userSuggestions === "undefined" ? void 0 : {
		initialPage: userSuggestionsSafeValues.initialPage,
		pageSize: userSuggestionsSafeValues.pageSize,
		status: userSuggestionsSafeValues.status
	};
	const isClerkLoaded = !!(clerk.loaded && user);
	const memberships = usePagesOrInfinite({
		fetcher: user?.getOrganizationMemberships,
		config: {
			keepPreviousData: userMembershipsSafeValues.keepPreviousData,
			infinite: userMembershipsSafeValues.infinite,
			enabled: !!userMembershipsParams,
			isSignedIn: Boolean(user),
			initialPage: userMembershipsSafeValues.initialPage,
			pageSize: userMembershipsSafeValues.pageSize
		},
		keys: createCacheKeys({
			stablePrefix: STABLE_KEYS.USER_MEMBERSHIPS_KEY,
			authenticated: Boolean(user),
			tracked: { userId: user?.id },
			untracked: { args: userMembershipsParams }
		})
	});
	const invitations = usePagesOrInfinite({
		fetcher: user?.getOrganizationInvitations,
		config: {
			keepPreviousData: userInvitationsSafeValues.keepPreviousData,
			infinite: userInvitationsSafeValues.infinite,
			enabled: !!userInvitationsParams,
			isSignedIn: Boolean(user),
			initialPage: userInvitationsSafeValues.initialPage,
			pageSize: userInvitationsSafeValues.pageSize
		},
		keys: createCacheKeys({
			stablePrefix: STABLE_KEYS.USER_INVITATIONS_KEY,
			authenticated: Boolean(user),
			tracked: { userId: user?.id },
			untracked: { args: userInvitationsParams }
		})
	});
	const suggestions = usePagesOrInfinite({
		fetcher: user?.getOrganizationSuggestions,
		config: {
			keepPreviousData: userSuggestionsSafeValues.keepPreviousData,
			infinite: userSuggestionsSafeValues.infinite,
			enabled: !!userSuggestionsParams,
			isSignedIn: Boolean(user),
			initialPage: userSuggestionsSafeValues.initialPage,
			pageSize: userSuggestionsSafeValues.pageSize
		},
		keys: createCacheKeys({
			stablePrefix: STABLE_KEYS.USER_SUGGESTIONS_KEY,
			authenticated: Boolean(user),
			tracked: { userId: user?.id },
			untracked: { args: userSuggestionsParams }
		})
	});
	if (!isClerkLoaded) return {
		isLoaded: false,
		createOrganization: void 0,
		setActive: void 0,
		userMemberships: undefinedPaginatedResource,
		userInvitations: undefinedPaginatedResource,
		userSuggestions: undefinedPaginatedResource
	};
	return {
		isLoaded: isClerkLoaded,
		setActive: clerk.setActive,
		createOrganization: clerk.createOrganization,
		userMemberships: memberships,
		userInvitations: invitations,
		userSuggestions: suggestions
	};
}

//#endregion
//#region src/react/hooks/useSafeLayoutEffect.tsx
/**
* @internal
*/
const useSafeLayoutEffect = typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

//#endregion
//#region src/react/hooks/useSession.ts
const hookName$3 = `useSession`;
/**
* The `useSession()` hook provides access to the current user's [`Session`](https://clerk.com/docs/reference/javascript/session) object, as well as helpers for setting the active session.
*
* @unionReturnHeadings
* ["Initialization", "Signed out", "Signed in"]
*
* @function
*
* @param [options] - An object containing options for the `useSession()` hook.
* @example
* ### Access the `Session` object
*
* The following example uses the `useSession()` hook to access the `Session` object, which has the `lastActiveAt` property. The `lastActiveAt` property is a `Date` object used to show the time the session was last active.
*
* <Tabs items='React,Next.js'>
* <Tab>
*
* ```tsx {{ filename: 'src/Home.tsx' }}
* import { useSession } from '@clerk/clerk-react'
*
* export default function Home() {
*   const { isLoaded, session, isSignedIn } = useSession()
*
*   if (!isLoaded) {
*     // Handle loading state
*     return null
*   }
*   if (!isSignedIn) {
*     // Handle signed out state
*     return null
*   }
*
*   return (
*     <div>
*       <p>This session has been active since {session.lastActiveAt.toLocaleString()}</p>
*     </div>
*   )
* }
* ```
*
* </Tab>
* <Tab>
*
* {@include ../../../docs/use-session.md#nextjs-01}
*
* </Tab>
* </Tabs>
*/
const useSession = () => {
	useAssertWrappedByClerkProvider(hookName$3);
	const session = useSessionContext();
	const clerk = useClerkInstanceContext();
	clerk.telemetry?.record(eventMethodCalled(hookName$3));
	if (session === void 0) return {
		isLoaded: false,
		isSignedIn: void 0,
		session: void 0
	};
	if (session === null) return {
		isLoaded: true,
		isSignedIn: false,
		session: null
	};
	return {
		isLoaded: true,
		isSignedIn: clerk.isSignedIn,
		session
	};
};

//#endregion
//#region src/react/hooks/useSessionList.ts
const hookName$2 = "useSessionList";
/**
* The `useSessionList()` hook returns an array of [`Session`](https://clerk.com/docs/reference/javascript/session) objects that have been registered on the client device.
*
* @unionReturnHeadings
* ["Initialization", "Loaded"]
*
* @function
*
* @example
* ### Get a list of sessions
*
* The following example uses `useSessionList()` to get a list of sessions that have been registered on the client device. The `sessions` property is used to show the number of times the user has visited the page.
*
* <Tabs items='React,Next.js'>
* <Tab>
*
* ```tsx {{ filename: 'src/Home.tsx' }}
* import { useSessionList } from '@clerk/clerk-react'
*
* export default function Home() {
*   const { isLoaded, sessions } = useSessionList()
*
*   if (!isLoaded) {
*     // Handle loading state
*     return null
*   }
*
*   return (
*     <div>
*       <p>Welcome back. You've been here {sessions.length} times before.</p>
*     </div>
*   )
* }
* ```
*
* </Tab>
* <Tab>
*
* {@include ../../../docs/use-session-list.md#nextjs-01}
*
* </Tab>
* </Tabs>
*/
const useSessionList = () => {
	useAssertWrappedByClerkProvider(hookName$2);
	const isomorphicClerk = useClerkInstanceContext();
	const client = useClientContext();
	useClerkInstanceContext().telemetry?.record(eventMethodCalled(hookName$2));
	if (!client) return {
		isLoaded: false,
		sessions: void 0,
		setActive: void 0
	};
	return {
		isLoaded: true,
		sessions: client.sessions,
		setActive: isomorphicClerk.setActive
	};
};

//#endregion
//#region src/react/hooks/useUser.ts
const hookName$1 = "useUser";
/**
* The `useUser()` hook provides access to the current user's [`User`](https://clerk.com/docs/reference/javascript/user) object, which contains all the data for a single user in your application and provides methods to manage their account. This hook also allows you to check if the user is signed in and if Clerk has loaded and initialized.
*
* @unionReturnHeadings
* ["Initialization", "Signed out", "Signed in"]
*
* @example
* ### Get the current user
*
* The following example uses the `useUser()` hook to access the [`User`](https://clerk.com/docs/reference/javascript/user) object, which contains the current user's data such as their full name. The `isLoaded` and `isSignedIn` properties are used to handle the loading state and to check if the user is signed in, respectively.
*
* ```tsx {{ filename: 'src/Example.tsx' }}
* import { useUser } from '@clerk/clerk-react'
*
* export default function Example() {
*   const { isSignedIn, user, isLoaded } = useUser()
*
*   if (!isLoaded) {
*     return <div>Loading...</div>
*   }
*
*   if (!isSignedIn) {
*     return <div>Sign in to view this page</div>
*   }
*
*   return <div>Hello {user.firstName}!</div>
* }
* ```
*
* @example
* ### Update user data
*
* The following example uses the `useUser()` hook to access the [`User`](https://clerk.com/docs/reference/javascript/user) object, which calls the [`update()`](https://clerk.com/docs/reference/javascript/user#update) method to update the current user's information.
*
* <Tabs items='React,Next.js'>
* <Tab>
*
* ```tsx {{ filename: 'src/Home.tsx' }}
* import { useUser } from '@clerk/clerk-react'
*
* export default function Home() {
*   const { isSignedIn, isLoaded, user } = useUser()
*
*   if (!isLoaded) {
*     // Handle loading state
*     return null
*   }
*
*   if (!isSignedIn) return null
*
*   const updateUser = async () => {
*     await user.update({
*       firstName: 'John',
*       lastName: 'Doe',
*     })
*   }
*
*   return (
*     <>
*       <button onClick={updateUser}>Update your name</button>
*       <p>user.firstName: {user.firstName}</p>
*       <p>user.lastName: {user.lastName}</p>
*     </>
*   )
* }
* ```
* </Tab>
* <Tab>
*
* {@include ../../../docs/use-user.md#nextjs-01}
*
* </Tab>
* </Tabs>
*
* @example
* ### Reload user data
*
* The following example uses the `useUser()` hook to access the [`User`](https://clerk.com/docs/reference/javascript/user) object, which calls the [`reload()`](https://clerk.com/docs/reference/javascript/user#reload) method to get the latest user's information.
*
* <Tabs items='React,Next.js'>
* <Tab>
*
* ```tsx {{ filename: 'src/Home.tsx' }}
* import { useUser } from '@clerk/clerk-react'
*
* export default function Home() {
*   const { isSignedIn, isLoaded, user } = useUser();
*
*   if (!isLoaded) {
*     // Handle loading state
*     return null;
*   }
*
*   if (!isSignedIn) return null;
*
*   const updateUser = async () => {
*     // Update data via an API endpoint
*     const updateMetadata = await fetch('/api/updateMetadata', {
*       method: 'POST',
*       body: JSON.stringify({
*         role: 'admin'
*       })
*     });
*
*     // Check if the update was successful
*     if ((await updateMetadata.json()).message !== 'success') {
*       throw new Error('Error updating');
*     }
*
*     // If the update was successful, reload the user data
*     await user.reload();
*   };
*
*   return (
*     <>
*       <button onClick={updateUser}>Update your metadata</button>
*       <p>user role: {user.publicMetadata.role}</p>
*     </>
*   );
* }
* ```
*
* </Tab>
* <Tab>
*
* {@include ../../../docs/use-user.md#nextjs-02}
*
* </Tab>
* </Tabs>
*/
function useUser() {
	useAssertWrappedByClerkProvider(hookName$1);
	const user = useUserContext();
	useClerkInstanceContext().telemetry?.record(eventMethodCalled(hookName$1));
	if (user === void 0) return {
		isLoaded: false,
		isSignedIn: void 0,
		user: void 0
	};
	if (user === null) return {
		isLoaded: true,
		isSignedIn: false,
		user: null
	};
	return {
		isLoaded: true,
		isSignedIn: true,
		user
	};
}

//#endregion
//#region src/react/hooks/useDeepEqualMemo.ts
const useDeepEqualMemoize = (value) => {
	const ref = React.useRef(value);
	if (!dequal(value, ref.current)) ref.current = value;
	return React.useMemo(() => ref.current, [ref.current]);
};
/**
* @internal
*/
const useDeepEqualMemo = (factory, dependencyArray) => {
	return React.useMemo(factory, useDeepEqualMemoize(dependencyArray));
};
/**
* @internal
*/
const isDeeplyEqual = dequal;

//#endregion
//#region src/react/hooks/useReverification.ts
const CLERK_API_REVERIFICATION_ERROR_CODE = "session_reverification_required";
/**
*
*/
async function resolveResult(result) {
	try {
		const r = await result;
		if (r instanceof Response) return r.json();
		return r;
	} catch (e) {
		if (isClerkAPIResponseError(e) && e.errors.find(({ code }) => code === CLERK_API_REVERIFICATION_ERROR_CODE)) return reverificationError();
		throw e;
	}
}
/**
*
*/
function createReverificationHandler(params) {
	/**
	*
	*/
	function assertReverification(fetcher) {
		return (async (...args) => {
			let result = await resolveResult(fetcher(...args));
			if (isReverificationHint(result)) {
				/**
				* Create a promise
				*/
				const resolvers = createDeferredPromise();
				const isValidMetadata = validateReverificationConfig(result.clerk_error.metadata?.reverification);
				const level = isValidMetadata ? isValidMetadata().level : void 0;
				const cancel = () => {
					resolvers.reject(new ClerkRuntimeError("User cancelled attempted verification", { code: "reverification_cancelled" }));
				};
				const complete = () => {
					resolvers.resolve(true);
				};
				if (params.onNeedsReverification === void 0)
 /**
				* On success resolve the pending promise
				* On cancel reject the pending promise
				*/
				params.openUIComponent?.({
					level,
					afterVerification: complete,
					afterVerificationCancelled: cancel
				});
				else params.onNeedsReverification({
					cancel,
					complete,
					level
				});
				/**
				* Wait until the promise from above have been resolved or rejected
				*/
				await resolvers.promise;
				/**
				* After the promise resolved successfully try the original request one more time
				*/
				result = await resolveResult(fetcher(...args));
			}
			return result;
		});
	}
	return assertReverification;
}
/**
* > [!WARNING]
* >
* > Depending on the SDK you're using, this feature requires `@clerk/nextjs@6.12.7` or later, `@clerk/clerk-react@5.25.1` or later, and `@clerk/clerk-js@5.57.1` or later.
*
* The `useReverification()` hook is used to handle a session's reverification flow. If a request requires reverification, a modal will display, prompting the user to verify their credentials. Upon successful verification, the original request will automatically retry.
*
* @function
*
* @returns The `useReverification()` hook returns an array with the "enhanced" fetcher.
*
* @example
* ### Handle cancellation of the reverification process
*
* The following example demonstrates how to handle scenarios where a user cancels the reverification flow, such as closing the modal, which might result in `myData` being `null`.
*
* In the following example, `myFetcher` would be a function in your backend that fetches data from the route that requires reverification. See the [guide on how to require reverification](https://clerk.com/docs/guides/secure/reverification) for more information.
*
* ```tsx {{ filename: 'src/components/MyButton.tsx' }}
* import { useReverification } from '@clerk/clerk-react'
* import { isReverificationCancelledError } from '@clerk/clerk-react/error'
*
* type MyData = {
*   balance: number
* }
*
* export function MyButton() {
*   const fetchMyData = () => fetch('/api/balance').then(res=> res.json() as Promise<MyData>)
*   const enhancedFetcher = useReverification(fetchMyData);
*
*   const handleClick = async () => {
*     try {
*       const myData = await enhancedFetcher()
*       //     ^ is types as `MyData`
*     } catch (e) {
*       // Handle error returned from the fetcher here
*
*       // You can also handle cancellation with the following
*       if (isReverificationCancelledError(err)) {
*         // Handle the cancellation error here
*       }
*     }
*   }
*
*   return <button onClick={handleClick}>Update User</button>
* }
* ```
*/
const useReverification = (fetcher, options) => {
	const { __internal_openReverification, telemetry } = useClerk();
	const fetcherRef = useRef(fetcher);
	const optionsRef = useRef(options);
	telemetry?.record(eventMethodCalled("useReverification", { onNeedsReverification: Boolean(options?.onNeedsReverification) }));
	useSafeLayoutEffect(() => {
		fetcherRef.current = fetcher;
		optionsRef.current = options;
	});
	return useCallback((...args) => {
		return createReverificationHandler({
			openUIComponent: __internal_openReverification,
			telemetry,
			...optionsRef.current
		})(fetcherRef.current)(...args);
	}, [__internal_openReverification, telemetry]);
};

//#endregion
//#region src/react/hooks/useBillingHookEnabled.ts
/**
* @internal
*/
function useBillingHookEnabled(params) {
	const clerk = useClerkInstanceContext();
	const enabledFromParam = params?.enabled ?? true;
	const environment = clerk.__unstable__environment;
	const user = useUserContext();
	const { organization } = useOrganizationContext();
	const isOrganization = params?.for === "organization";
	const billingEnabled = isOrganization ? environment?.commerceSettings.billing.organization.enabled : environment?.commerceSettings.billing.user.enabled;
	const requireUserAndOrganizationWhenAuthenticated = params?.authenticated ?? true ? (isOrganization ? Boolean(organization?.id) : true) && Boolean(user?.id) : true;
	return billingEnabled && enabledFromParam && clerk.loaded && requireUserAndOrganizationWhenAuthenticated;
}

//#endregion
//#region src/react/hooks/createBillingPaginatedHook.tsx
/**
* A hook factory that creates paginated data fetching hooks for commerce-related resources.
* It provides a standardized way to create hooks that can fetch either user or Organization resources
* with built-in pagination support.
*
* The generated hooks handle:
* - Clerk authentication context
* - Resource-specific data fetching
* - Pagination (both traditional and infinite scroll)
* - Telemetry tracking
* - Type safety for the specific resource.
*
* @internal
*/
function createBillingPaginatedHook({ hookName: hookName$4, resourceType, useFetcher, options }) {
	return function useBillingHook(params) {
		const { for: _for, enabled: externalEnabled,...paginationParams } = params || {};
		const safeFor = _for || "user";
		useAssertWrappedByClerkProvider(hookName$4);
		const fetchFn = useFetcher(safeFor);
		const safeValues = useWithSafeValues(paginationParams, {
			initialPage: 1,
			pageSize: 10,
			keepPreviousData: false,
			infinite: false,
			__experimental_mode: void 0
		});
		const clerk = useClerkInstanceContext();
		const user = useUserContext();
		const { organization } = useOrganizationContext();
		clerk.telemetry?.record(eventMethodCalled(hookName$4));
		const isForOrganization = safeFor === "organization";
		const billingEnabled = useBillingHookEnabled({
			for: safeFor,
			enabled: externalEnabled,
			authenticated: !options?.unauthenticated
		});
		const hookParams = typeof paginationParams === "undefined" ? void 0 : {
			initialPage: safeValues.initialPage,
			pageSize: safeValues.pageSize,
			...options?.unauthenticated ? {} : isForOrganization ? { orgId: organization?.id } : {}
		};
		const isEnabled = !!hookParams && clerk.loaded && !!billingEnabled;
		return usePagesOrInfinite({
			fetcher: fetchFn,
			config: {
				keepPreviousData: safeValues.keepPreviousData,
				infinite: safeValues.infinite,
				enabled: isEnabled,
				...options?.unauthenticated ? {} : { isSignedIn: user !== null },
				__experimental_mode: safeValues.__experimental_mode,
				initialPage: safeValues.initialPage,
				pageSize: safeValues.pageSize
			},
			keys: createCacheKeys({
				stablePrefix: resourceType,
				authenticated: !options?.unauthenticated,
				tracked: options?.unauthenticated ? { for: safeFor } : {
					userId: user?.id,
					...isForOrganization ? { ["_orgId"]: organization?.id } : {}
				},
				untracked: { args: hookParams }
			})
		});
	};
}

//#endregion
//#region src/react/hooks/useStatements.tsx
/**
* @internal
*/
const useStatements = createBillingPaginatedHook({
	hookName: "useStatements",
	resourceType: STABLE_KEYS.STATEMENTS_KEY,
	useFetcher: () => {
		const clerk = useClerkInstanceContext();
		if (clerk.loaded) return clerk.billing.getStatements;
	}
});

//#endregion
//#region src/react/hooks/usePaymentAttempts.tsx
/**
* @internal
*/
const usePaymentAttempts = createBillingPaginatedHook({
	hookName: "usePaymentAttempts",
	resourceType: STABLE_KEYS.PAYMENT_ATTEMPTS_KEY,
	useFetcher: () => {
		const clerk = useClerkInstanceContext();
		if (clerk.loaded) return clerk.billing.getPaymentAttempts;
	}
});

//#endregion
//#region src/react/hooks/usePaymentMethods.tsx
/**
* @internal
*/
const usePaymentMethods = createBillingPaginatedHook({
	hookName: "usePaymentMethods",
	resourceType: STABLE_KEYS.PAYMENT_METHODS_KEY,
	useFetcher: (resource) => {
		const { organization } = useOrganizationContext();
		const user = useUserContext();
		if (resource === "organization") return organization?.getPaymentMethods;
		return user?.getPaymentMethods;
	}
});

//#endregion
//#region src/react/hooks/usePlans.tsx
/**
* @internal
*/
const usePlans = createBillingPaginatedHook({
	hookName: "usePlans",
	resourceType: STABLE_KEYS.PLANS_KEY,
	useFetcher: (_for) => {
		const clerk = useClerkInstanceContext();
		if (!clerk.loaded) return;
		return (params) => clerk.billing.getPlans({
			...params,
			for: _for
		});
	},
	options: { unauthenticated: true }
});

//#endregion
//#region src/react/hooks/useSubscription.shared.ts
function useSubscriptionCacheKeys(params) {
	const { userId, orgId, for: forType } = params;
	return useMemo(() => {
		const safeOrgId = forType === "organization" ? orgId : void 0;
		return createCacheKeys({
			stablePrefix: STABLE_KEYS.SUBSCRIPTION_KEY,
			authenticated: true,
			tracked: {
				userId,
				orgId: safeOrgId
			},
			untracked: { args: { orgId: safeOrgId } }
		});
	}, [
		userId,
		orgId,
		forType
	]);
}

//#endregion
//#region src/react/hooks/useSubscription.swr.tsx
const hookName = "useSubscription";
/**
* This is the existing implementation of useSubscription using SWR.
* It is kept here for backwards compatibility until our next major version.
*
* @internal
*/
function useSubscription(params) {
	useAssertWrappedByClerkProvider(hookName);
	const clerk = useClerkInstanceContext();
	const user = useUserContext();
	const { organization } = useOrganizationContext();
	const environment = clerk.__unstable__environment;
	clerk.telemetry?.record(eventMethodCalled(hookName));
	const billingEnabled = params?.for === "organization" ? environment?.commerceSettings.billing.organization.enabled : environment?.commerceSettings.billing.user.enabled;
	const isEnabled = (params?.enabled ?? true) && billingEnabled;
	const { queryKey } = useSubscriptionCacheKeys({
		userId: user?.id,
		orgId: organization?.id,
		for: params?.for
	});
	const swr = useSWR(isEnabled ? { queryKey } : null, ({ queryKey: queryKey$1 }) => {
		const args = queryKey$1[3].args;
		if (queryKey$1[2].userId) return clerk.billing.getSubscription(args);
		return null;
	}, {
		dedupingInterval: 1e3 * 60,
		keepPreviousData: params?.keepPreviousData
	});
	const revalidate = useCallback(() => {
		swr.mutate();
	}, [swr]);
	return {
		data: swr.data,
		error: swr.error,
		isLoading: swr.isLoading,
		isFetching: swr.isValidating,
		revalidate
	};
}

//#endregion
//#region src/react/hooks/useCheckout.ts
/**
* @function
*
* @param [options] - An object containing the configuration for the checkout flow.
*
* **Required** if the hook is used without a `<CheckoutProvider />` wrapping the component tree.
*/
const useCheckout = (options) => {
	const contextOptions = useCheckoutContext();
	const { for: forOrganization, planId, planPeriod } = options || contextOptions;
	const clerk = useClerk();
	const { organization } = useOrganizationContext();
	const { isLoaded, user } = useUser();
	if (!isLoaded) throw new Error("Clerk: Ensure that `useCheckout` is inside a component wrapped with `<ClerkLoaded />`.");
	if (!user) throw new Error("Clerk: Ensure that `useCheckout` is inside a component wrapped with `<SignedIn />`.");
	if (forOrganization === "organization" && !organization) throw new Error("Clerk: Ensure your flow checks for an active organization. Retrieve `orgId` from `useAuth()` and confirm it is defined. For SSR, see: https://clerk.com/docs/reference/backend/types/auth-object#how-to-access-the-auth-object");
	const manager = useMemo(() => clerk.__experimental_checkout({
		planId,
		planPeriod,
		for: forOrganization
	}), [
		user.id,
		organization?.id,
		planId,
		planPeriod,
		forOrganization
	]);
	const managerProperties = useSyncExternalStore((cb) => manager.subscribe(cb), () => manager.getState(), () => manager.getState());
	return { checkout: {
		...useMemo(() => {
			if (!managerProperties.checkout) return {
				id: null,
				externalClientSecret: null,
				externalGatewayId: null,
				totals: null,
				isImmediatePlanChange: null,
				planPeriod: null,
				plan: null,
				paymentMethod: null,
				freeTrialEndsAt: null,
				payer: null,
				needsPaymentMethod: null,
				planPeriodStart: null
			};
			const { reload, confirm, pathRoot,...rest } = managerProperties.checkout;
			return rest;
		}, [managerProperties.checkout]),
		getState: manager.getState,
		start: manager.start,
		confirm: manager.confirm,
		clear: manager.clear,
		finalize: manager.finalize,
		isStarting: managerProperties.isStarting,
		isConfirming: managerProperties.isConfirming,
		error: managerProperties.error,
		status: managerProperties.status,
		fetchStatus: managerProperties.fetchStatus
	} };
};

//#endregion
//#region src/react/hooks/useStatementQuery.shared.ts
function useStatementQueryCacheKeys(params) {
	const { statementId, userId, orgId, for: forType } = params;
	return useMemo(() => {
		return createCacheKeys({
			stablePrefix: INTERNAL_STABLE_KEYS.BILLING_STATEMENTS_KEY,
			authenticated: true,
			tracked: {
				statementId,
				forType,
				userId,
				orgId
			},
			untracked: { args: {
				id: statementId ?? void 0,
				orgId: orgId ?? void 0
			} }
		});
	}, [
		statementId,
		forType,
		userId,
		orgId
	]);
}

//#endregion
//#region src/react/hooks/useStatementQuery.swr.tsx
/**
* This is the existing implementation of useStatementQuery using SWR.
* It is kept here for backwards compatibility until our next major version.
*
* @internal
*/
function __internal_useStatementQuery(params = {}) {
	const { statementId = null, enabled = true, keepPreviousData = false, for: forType = "user" } = params;
	const clerk = useClerkInstanceContext();
	const user = useUserContext();
	const { organization } = useOrganizationContext();
	const organizationId = forType === "organization" ? organization?.id ?? null : null;
	const { queryKey } = useStatementQueryCacheKeys({
		statementId,
		userId: user?.id ?? null,
		orgId: organizationId,
		for: forType
	});
	const swr = useSWR(Boolean(statementId) && enabled && (forType !== "organization" || Boolean(organizationId)) ? queryKey : null, () => {
		if (!statementId) throw new Error("statementId is required to fetch a statement");
		return clerk.billing.getStatement({
			id: statementId,
			orgId: organizationId ?? void 0
		});
	}, {
		dedupingInterval: 1e3 * 60,
		keepPreviousData
	});
	return {
		data: swr.data,
		error: swr.error ?? null,
		isLoading: swr.isLoading,
		isFetching: swr.isValidating
	};
}

//#endregion
//#region src/react/hooks/usePlanDetailsQuery.shared.ts
function usePlanDetailsQueryCacheKeys(params) {
	const { planId } = params;
	return useMemo(() => {
		return createCacheKeys({
			stablePrefix: INTERNAL_STABLE_KEYS.BILLING_PLANS_KEY,
			authenticated: false,
			tracked: { planId: planId ?? null },
			untracked: { args: { id: planId ?? void 0 } }
		});
	}, [planId]);
}

//#endregion
//#region src/react/hooks/usePlanDetailsQuery.swr.tsx
/**
* This is the existing implementation of usePlanDetailsQuery using SWR.
* It is kept here for backwards compatibility until our next major version.
*
* @internal
*/
function usePlanDetailsQuery(params = {}) {
	const { planId, initialPlan = null, enabled = true, keepPreviousData = true } = params;
	const clerk = useClerkInstanceContext();
	const targetPlanId = planId ?? initialPlan?.id ?? null;
	const { queryKey } = usePlanDetailsQueryCacheKeys({ planId: targetPlanId });
	const swr = useSWR(Boolean(targetPlanId) && enabled ? queryKey : null, () => {
		if (!targetPlanId) throw new Error("planId is required to fetch plan details");
		return clerk.billing.getPlan({ id: targetPlanId });
	}, {
		dedupingInterval: 1e3 * 60,
		keepPreviousData,
		fallbackData: initialPlan ?? void 0
	});
	return {
		data: swr.data,
		error: swr.error ?? null,
		isLoading: swr.isLoading,
		isFetching: swr.isValidating
	};
}

//#endregion
//#region src/react/hooks/usePaymentAttemptQuery.shared.ts
function usePaymentAttemptQueryCacheKeys(params) {
	const { paymentAttemptId, userId, orgId, for: forType } = params;
	return useMemo(() => {
		return createCacheKeys({
			stablePrefix: INTERNAL_STABLE_KEYS.PAYMENT_ATTEMPT_KEY,
			authenticated: true,
			tracked: {
				paymentAttemptId,
				forType,
				userId,
				orgId
			},
			untracked: { args: {
				id: paymentAttemptId ?? void 0,
				orgId: orgId ?? void 0
			} }
		});
	}, [
		paymentAttemptId,
		forType,
		userId,
		orgId
	]);
}

//#endregion
//#region src/react/hooks/usePaymentAttemptQuery.swr.tsx
/**
* This is the existing implementation of usePaymentAttemptQuery using SWR.
* It is kept here for backwards compatibility until our next major version.
*
* @internal
*/
function __internal_usePaymentAttemptQuery(params) {
	const { paymentAttemptId, enabled = true, keepPreviousData = false, for: forType = "user" } = params;
	const clerk = useClerkInstanceContext();
	const user = useUserContext();
	const { organization } = useOrganizationContext();
	const organizationId = forType === "organization" ? organization?.id ?? null : null;
	const { queryKey } = usePaymentAttemptQueryCacheKeys({
		paymentAttemptId,
		userId: user?.id ?? null,
		orgId: organizationId,
		for: forType
	});
	const swr = useSWR(Boolean(paymentAttemptId) && enabled && (forType !== "organization" || Boolean(organizationId)) ? { queryKey } : null, ({ queryKey: queryKey$1 }) => {
		const args = queryKey$1[3].args;
		return clerk.billing.getPaymentAttempt(args);
	}, {
		dedupingInterval: 1e3 * 60,
		keepPreviousData
	});
	return {
		data: swr.data,
		error: swr.error ?? null,
		isLoading: swr.isLoading,
		isFetching: swr.isValidating
	};
}

//#endregion
//#region src/react/stripe-react/utils.ts
const usePrevious = (value) => {
	const ref = useRef(value);
	useEffect(() => {
		ref.current = value;
	}, [value]);
	return ref.current;
};
const useAttachEvent = (element, event, cb) => {
	const cbDefined = !!cb;
	const cbRef = useRef(cb);
	useEffect(() => {
		cbRef.current = cb;
	}, [cb]);
	useEffect(() => {
		if (!cbDefined || !element) return () => {};
		const decoratedCb = (...args) => {
			if (cbRef.current) cbRef.current(...args);
		};
		element.on(event, decoratedCb);
		return () => {
			element.off(event, decoratedCb);
		};
	}, [
		cbDefined,
		event,
		element,
		cbRef
	]);
};

//#endregion
//#region src/react/stripe-react/index.tsx
const ElementsContext = React.createContext(null);
ElementsContext.displayName = "ElementsContext";
const parseElementsContext = (ctx, useCase) => {
	if (!ctx) throw new Error(`Could not find Elements context; You need to wrap the part of your app that ${useCase} in an <Elements> provider.`);
	return ctx;
};
/**
* The `Elements` provider allows you to use [Element components](https://stripe.com/docs/stripe-js/react#element-components) and access the [Stripe object](https://stripe.com/docs/js/initializing) in any nested component.
* Render an `Elements` provider at the root of your React app so that it is available everywhere you need it.
*
* To use the `Elements` provider, call `loadStripe` from `@stripe/stripe-js` with your publishable key.
* The `loadStripe` function will asynchronously load the Stripe.js script and initialize a `Stripe` object.
* Pass the returned `Promise` to `Elements`.
*
* @docs https://stripe.com/docs/stripe-js/react#elements-provider
*/
const Elements = (({ stripe: rawStripeProp, options, children }) => {
	const parsed = React.useMemo(() => parseStripeProp(rawStripeProp), [rawStripeProp]);
	const [ctx, setContext] = React.useState(() => ({
		stripe: parsed.tag === "sync" ? parsed.stripe : null,
		elements: parsed.tag === "sync" ? parsed.stripe.elements(options) : null
	}));
	React.useEffect(() => {
		let isMounted = true;
		const safeSetContext = (stripe) => {
			setContext((ctx$1) => {
				if (ctx$1.stripe) return ctx$1;
				return {
					stripe,
					elements: stripe.elements(options)
				};
			});
		};
		if (parsed.tag === "async" && !ctx.stripe) parsed.stripePromise.then((stripe) => {
			if (stripe && isMounted) safeSetContext(stripe);
		});
		else if (parsed.tag === "sync" && !ctx.stripe) safeSetContext(parsed.stripe);
		return () => {
			isMounted = false;
		};
	}, [
		parsed,
		ctx,
		options
	]);
	const prevStripe = usePrevious(rawStripeProp);
	React.useEffect(() => {
		if (prevStripe !== null && prevStripe !== rawStripeProp) console.warn("Unsupported prop change on Elements: You cannot change the `stripe` prop after setting it.");
	}, [prevStripe, rawStripeProp]);
	const prevOptions = usePrevious(options);
	React.useEffect(() => {
		if (!ctx.elements) return;
		const updates = extractAllowedOptionsUpdates(options, prevOptions, ["clientSecret", "fonts"]);
		if (updates) ctx.elements.update(updates);
	}, [
		options,
		prevOptions,
		ctx.elements
	]);
	return /* @__PURE__ */ React.createElement(ElementsContext.Provider, { value: ctx }, children);
});
const useElementsContextWithUseCase = (useCaseMessage) => {
	return parseElementsContext(React.useContext(ElementsContext), useCaseMessage);
};
const useElements = () => {
	const { elements } = useElementsContextWithUseCase("calls useElements()");
	return elements;
};
const INVALID_STRIPE_ERROR = "Invalid prop `stripe` supplied to `Elements`. We recommend using the `loadStripe` utility from `@stripe/stripe-js`. See https://stripe.com/docs/stripe-js/react#elements-props-stripe for details.";
const validateStripe = (maybeStripe, errorMsg = INVALID_STRIPE_ERROR) => {
	if (maybeStripe === null || isStripe(maybeStripe)) return maybeStripe;
	throw new Error(errorMsg);
};
const parseStripeProp = (raw, errorMsg = INVALID_STRIPE_ERROR) => {
	if (isPromise(raw)) return {
		tag: "async",
		stripePromise: Promise.resolve(raw).then((result) => validateStripe(result, errorMsg))
	};
	const stripe = validateStripe(raw, errorMsg);
	if (stripe === null) return { tag: "empty" };
	return {
		tag: "sync",
		stripe
	};
};
const isUnknownObject = (raw) => {
	return raw !== null && typeof raw === "object";
};
const isPromise = (raw) => {
	return isUnknownObject(raw) && typeof raw.then === "function";
};
const isStripe = (raw) => {
	return isUnknownObject(raw) && typeof raw.elements === "function" && typeof raw.createToken === "function" && typeof raw.createPaymentMethod === "function" && typeof raw.confirmCardPayment === "function";
};
const extractAllowedOptionsUpdates = (options, prevOptions, immutableKeys) => {
	if (!isUnknownObject(options)) return null;
	return Object.keys(options).reduce((newOptions, key) => {
		const isUpdated = !isUnknownObject(prevOptions) || !isEqual(options[key], prevOptions[key]);
		if (immutableKeys.includes(key)) {
			if (isUpdated) console.warn(`Unsupported prop change: options.${key} is not a mutable property.`);
			return newOptions;
		}
		if (!isUpdated) return newOptions;
		return {
			...newOptions || {},
			[key]: options[key]
		};
	}, null);
};
const PLAIN_OBJECT_STR = "[object Object]";
const isEqual = (left, right) => {
	if (!isUnknownObject(left) || !isUnknownObject(right)) return left === right;
	const leftArray = Array.isArray(left);
	if (leftArray !== Array.isArray(right)) return false;
	const leftPlainObject = Object.prototype.toString.call(left) === PLAIN_OBJECT_STR;
	if (leftPlainObject !== (Object.prototype.toString.call(right) === PLAIN_OBJECT_STR)) return false;
	if (!leftPlainObject && !leftArray) return left === right;
	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);
	if (leftKeys.length !== rightKeys.length) return false;
	const keySet = {};
	for (let i = 0; i < leftKeys.length; i += 1) keySet[leftKeys[i]] = true;
	for (let i = 0; i < rightKeys.length; i += 1) keySet[rightKeys[i]] = true;
	const allKeys = Object.keys(keySet);
	if (allKeys.length !== leftKeys.length) return false;
	const l = left;
	const r = right;
	const pred = (key) => {
		return isEqual(l[key], r[key]);
	};
	return allKeys.every(pred);
};
const useStripe = () => {
	const { stripe } = useElementsOrCheckoutSdkContextWithUseCase("calls useStripe()");
	return stripe;
};
const useElementsOrCheckoutSdkContextWithUseCase = (useCaseString) => {
	return parseElementsContext(React.useContext(ElementsContext), useCaseString);
};
const capitalized = (str) => str.charAt(0).toUpperCase() + str.slice(1);
const createElementComponent = (type, isServer) => {
	const displayName = `${capitalized(type)}Element`;
	const ClientElement = ({ id, className, fallback, options = {}, onBlur, onFocus, onReady, onChange, onEscape, onClick, onLoadError, onLoaderStart, onNetworksChange, onConfirm, onCancel, onShippingAddressChange, onShippingRateChange }) => {
		const ctx = useElementsOrCheckoutSdkContextWithUseCase(`mounts <${displayName}>`);
		const elements = "elements" in ctx ? ctx.elements : null;
		const [element, setElement] = React.useState(null);
		const elementRef = React.useRef(null);
		const domNode = React.useRef(null);
		const [isReady, setReady] = useState(false);
		useAttachEvent(element, "blur", onBlur);
		useAttachEvent(element, "focus", onFocus);
		useAttachEvent(element, "escape", onEscape);
		useAttachEvent(element, "click", onClick);
		useAttachEvent(element, "loaderror", onLoadError);
		useAttachEvent(element, "loaderstart", onLoaderStart);
		useAttachEvent(element, "networkschange", onNetworksChange);
		useAttachEvent(element, "confirm", onConfirm);
		useAttachEvent(element, "cancel", onCancel);
		useAttachEvent(element, "shippingaddresschange", onShippingAddressChange);
		useAttachEvent(element, "shippingratechange", onShippingRateChange);
		useAttachEvent(element, "change", onChange);
		let readyCallback;
		if (onReady) readyCallback = () => {
			setReady(true);
			onReady(element);
		};
		useAttachEvent(element, "ready", readyCallback);
		React.useLayoutEffect(() => {
			if (elementRef.current === null && domNode.current !== null && elements) {
				let newElement = null;
				if (elements) newElement = elements.create(type, options);
				elementRef.current = newElement;
				setElement(newElement);
				if (newElement) newElement.mount(domNode.current);
			}
		}, [elements, options]);
		const prevOptions = usePrevious(options);
		React.useEffect(() => {
			if (!elementRef.current) return;
			const updates = extractAllowedOptionsUpdates(options, prevOptions, ["paymentRequest"]);
			if (updates && "update" in elementRef.current) elementRef.current.update(updates);
		}, [options, prevOptions]);
		React.useLayoutEffect(() => {
			return () => {
				if (elementRef.current && typeof elementRef.current.destroy === "function") try {
					elementRef.current.destroy();
					elementRef.current = null;
				} catch {}
			};
		}, []);
		return /* @__PURE__ */ React.createElement(React.Fragment, null, !isReady && fallback, /* @__PURE__ */ React.createElement("div", {
			id,
			style: {
				height: isReady ? "unset" : "0px",
				visibility: isReady ? "visible" : "hidden"
			},
			className,
			ref: domNode
		}));
	};
	const ServerElement = (props) => {
		useElementsOrCheckoutSdkContextWithUseCase(`mounts <${displayName}>`);
		const { id, className } = props;
		return /* @__PURE__ */ React.createElement("div", {
			id,
			className
		});
	};
	const Element = isServer ? ServerElement : ClientElement;
	Element.displayName = displayName;
	Element.__elementType = type;
	return Element;
};
const PaymentElement$1 = createElementComponent("payment", typeof window === "undefined");

//#endregion
//#region src/react/billing/useInitializePaymentMethod.swr.tsx
/**
* This is the existing implementation of the payment method initializer using SWR.
* It is kept here for backwards compatibility until our next major version.
*
* @internal
*/
function useInitializePaymentMethod(options) {
	const { for: forType = "user" } = options ?? {};
	const { organization } = useOrganizationContext();
	const user = useUserContext();
	const resource = forType === "organization" ? organization : user;
	const { data, trigger } = useSWRMutation(resource?.id ? {
		key: "billing-payment-method-initialize",
		resourceId: resource.id,
		for: forType
	} : null, () => {
		return resource?.initializePaymentMethod({ gateway: "stripe" });
	});
	useEffect(() => {
		if (!resource?.id) return;
		trigger().catch(() => {});
	}, [resource?.id, trigger]);
	return {
		initializedPaymentMethod: data,
		initializePaymentMethod: trigger
	};
}

//#endregion
//#region src/react/billing/useStripeClerkLibs.swr.tsx
/**
* This is the existing implementation of the Stripe libraries loader using SWR.
* It is kept here for backwards compatibility until our next major version.
*
* @internal
*/
function useStripeClerkLibs() {
	const clerk = useClerk();
	return useSWR("clerk-stripe-sdk", async () => {
		return { loadStripe: await clerk.__internal_loadStripeJs() };
	}, {
		keepPreviousData: true,
		revalidateOnFocus: false,
		dedupingInterval: Infinity
	}).data ?? null;
}

//#endregion
//#region src/react/billing/useStripeLoader.swr.tsx
/**
* This is the existing implementation of the Stripe instance loader using SWR.
* It is kept here for backwards compatibility until our next major version.
*
* @internal
*/
function useStripeLoader(options) {
	const { stripeClerkLibs, externalGatewayId, stripePublishableKey } = options;
	return useSWR(stripeClerkLibs && externalGatewayId && stripePublishableKey ? {
		key: "stripe-sdk",
		externalGatewayId,
		stripePublishableKey
	} : null, ({ stripePublishableKey: stripePublishableKey$1, externalGatewayId: externalGatewayId$1 }) => {
		return stripeClerkLibs?.loadStripe(stripePublishableKey$1, { stripeAccount: externalGatewayId$1 });
	}, {
		keepPreviousData: true,
		revalidateOnFocus: false,
		dedupingInterval: 1e3 * 60
	}).data;
}

//#endregion
//#region src/react/billing/payment-element.tsx
const useInternalEnvironment = () => {
	return useClerk().__unstable__environment;
};
const useLocalization = () => {
	const clerk = useClerk();
	let locale = "en";
	try {
		locale = clerk.__internal_getOption("localization")?.locale || "en";
	} catch {}
	return locale.split("-")[0];
};
const usePaymentSourceUtils = (forResource = "user") => {
	const stripeClerkLibs = useStripeClerkLibs();
	const environment = useInternalEnvironment();
	const { initializedPaymentMethod, initializePaymentMethod } = useInitializePaymentMethod({ for: forResource });
	const stripePublishableKey = environment?.commerceSettings.billing.stripePublishableKey ?? void 0;
	return {
		stripe: useStripeLoader({
			stripeClerkLibs,
			externalGatewayId: initializedPaymentMethod?.externalGatewayId,
			stripePublishableKey
		}),
		initializePaymentMethod,
		externalClientSecret: initializedPaymentMethod?.externalClientSecret,
		paymentMethodOrder: initializedPaymentMethod?.paymentMethodOrder
	};
};
const [PaymentElementContext, usePaymentElementContext] = createContextAndHook("PaymentElementContext");
const [StripeUtilsContext, useStripeUtilsContext] = createContextAndHook("StripeUtilsContext");
const ValidateStripeUtils = ({ children }) => {
	const stripe = useStripe();
	const elements = useElements();
	return /* @__PURE__ */ React.createElement(StripeUtilsContext.Provider, { value: { value: {
		stripe,
		elements
	} } }, children);
};
const DummyStripeUtils = ({ children }) => {
	return /* @__PURE__ */ React.createElement(StripeUtilsContext.Provider, { value: { value: {} } }, children);
};
const PropsProvider = ({ children,...props }) => {
	const utils = usePaymentSourceUtils(props.for);
	const [isPaymentElementReady, setIsPaymentElementReady] = useState(false);
	return /* @__PURE__ */ React.createElement(PaymentElementContext.Provider, { value: { value: {
		...props,
		...utils,
		setIsPaymentElementReady,
		isPaymentElementReady
	} } }, children);
};
const PaymentElementProvider = ({ children,...props }) => {
	return /* @__PURE__ */ React.createElement(PropsProvider, props, /* @__PURE__ */ React.createElement(PaymentElementInternalRoot, null, children));
};
const PaymentElementInternalRoot = (props) => {
	const { stripe, externalClientSecret, stripeAppearance } = usePaymentElementContext();
	const locale = useLocalization();
	if (stripe && externalClientSecret) return /* @__PURE__ */ React.createElement(Elements, {
		key: externalClientSecret,
		stripe,
		options: {
			loader: "never",
			clientSecret: externalClientSecret,
			appearance: { variables: stripeAppearance },
			locale
		}
	}, /* @__PURE__ */ React.createElement(ValidateStripeUtils, null, props.children));
	return /* @__PURE__ */ React.createElement(DummyStripeUtils, null, props.children);
};
const PaymentElement = ({ fallback }) => {
	const { setIsPaymentElementReady, paymentMethodOrder, checkout, stripe, externalClientSecret, paymentDescription, for: _for } = usePaymentElementContext();
	const environment = useInternalEnvironment();
	const applePay = useMemo(() => {
		if (!checkout || !checkout.totals || !checkout.plan) return;
		return { recurringPaymentRequest: {
			paymentDescription: paymentDescription || "",
			managementURL: _for === "organization" ? environment?.displayConfig.organizationProfileUrl || "" : environment?.displayConfig.userProfileUrl || "",
			regularBilling: {
				amount: checkout.totals.totalDueNow?.amount || checkout.totals.grandTotal.amount,
				label: checkout.plan.name,
				recurringPaymentIntervalUnit: checkout.planPeriod === "annual" ? "year" : "month"
			}
		} };
	}, [
		checkout,
		paymentDescription,
		_for,
		environment
	]);
	const options = useMemo(() => {
		return {
			layout: {
				type: "tabs",
				defaultCollapsed: false
			},
			paymentMethodOrder,
			applePay
		};
	}, [applePay, paymentMethodOrder]);
	const onReady = useCallback(() => {
		setIsPaymentElementReady(true);
	}, [setIsPaymentElementReady]);
	if (!stripe || !externalClientSecret) return /* @__PURE__ */ React.createElement(React.Fragment, null, fallback);
	return /* @__PURE__ */ React.createElement(PaymentElement$1, {
		fallback,
		onReady,
		options
	});
};
const throwLibsMissingError = () => {
	throw new Error("Clerk: Unable to submit, Stripe libraries are not yet loaded. Be sure to check `isFormReady` before calling `submit`.");
};
const usePaymentElement = () => {
	const { isPaymentElementReady, initializePaymentMethod } = usePaymentElementContext();
	const { stripe, elements } = useStripeUtilsContext();
	const { externalClientSecret } = usePaymentElementContext();
	const submit = useCallback(async () => {
		if (!stripe || !elements) return throwLibsMissingError();
		const { setupIntent, error } = await stripe.confirmSetup({
			elements,
			confirmParams: { return_url: window.location.href },
			redirect: "if_required"
		});
		if (error) return {
			data: null,
			error: {
				gateway: "stripe",
				error: {
					code: error.code,
					message: error.message,
					type: error.type
				}
			}
		};
		return {
			data: {
				gateway: "stripe",
				paymentToken: setupIntent.payment_method
			},
			error: null
		};
	}, [stripe, elements]);
	const reset = useCallback(async () => {
		if (!stripe || !elements) return throwLibsMissingError();
		await initializePaymentMethod();
	}, [
		stripe,
		elements,
		initializePaymentMethod
	]);
	const isProviderReady = Boolean(stripe && externalClientSecret);
	if (!isProviderReady) return {
		submit: throwLibsMissingError,
		reset: throwLibsMissingError,
		isFormReady: false,
		provider: void 0,
		isProviderReady: false
	};
	return {
		submit,
		reset,
		isFormReady: isPaymentElementReady,
		provider: { name: "stripe" },
		isProviderReady
	};
};

//#endregion
export { ClerkInstanceContext, ClientContext, OptionsContext, OrganizationProvider, SessionContext, UserContext, __experimental_CheckoutProvider, PaymentElement as __experimental_PaymentElement, PaymentElementProvider as __experimental_PaymentElementProvider, useAPIKeys as __experimental_useAPIKeys, useCheckout as __experimental_useCheckout, usePaymentAttempts as __experimental_usePaymentAttempts, usePaymentElement as __experimental_usePaymentElement, usePaymentMethods as __experimental_usePaymentMethods, usePlans as __experimental_usePlans, useStatements as __experimental_useStatements, useSubscription as __experimental_useSubscription, __internal_usePaymentAttemptQuery, usePlanDetailsQuery as __internal_usePlanDetailsQuery, __internal_useStatementQuery, assertContextExists, createContextAndHook, isDeeplyEqual, useAssertWrappedByClerkProvider, useAttemptToEnableOrganizations, useClerk, useClerkInstanceContext, useClientContext, useDeepEqualMemo, useOptionsContext, useOrganization, useOrganizationContext, useOrganizationList, useReverification, useSafeLayoutEffect, useSession, useSessionContext, useSessionList, useUser, useUserContext };
//# sourceMappingURL=index.mjs.map