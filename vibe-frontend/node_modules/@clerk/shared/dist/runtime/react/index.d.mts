import { APIKeyResource, BillingCheckoutResource, BillingPaymentMethodResource, BillingPaymentResource, BillingPlanResource, BillingStatementResource, BillingSubscriptionPlanPeriod, BillingSubscriptionResource, ClerkAPIResponseError, ClerkAPIResponseError$1, ClerkOptions, ClerkPaginatedResponse, ClientResource, CreateOrganizationParams, ForPayerType, GetAPIKeysParams, GetDomainsParams, GetInvitationsParams, GetMembersParams, GetMembershipRequestParams, GetUserOrganizationInvitationsParams, GetUserOrganizationMembershipParams, GetUserOrganizationSuggestionsParams, LoadedClerk, OrganizationDomainResource, OrganizationInvitationResource, OrganizationMembershipRequestResource, OrganizationMembershipResource, OrganizationResource, OrganizationSuggestionResource, SessionVerificationLevel, SetActive, SetActiveNavigate, SignedInSessionResource, UseSessionListReturn, UseSessionReturn, UseUserReturn, UserOrganizationInvitationResource, UserResource, __experimental_CheckoutCacheState, __experimental_CheckoutInstance } from "../index-BnRZtxqr.mjs";
import "../apiUrlFromPublishableKey-BMA_oB1l.mjs";
import "../browser-CwBluoYn.mjs";
import "../color-BLLAl-EC.mjs";
import "../constants-UOcJjdve.mjs";
import "../date-DIGfFkoy.mjs";
import "../deprecated-BRApxWmG.mjs";
import "../deriveState-BOtpW9a_.mjs";
import "../devBrowser-DGNGESpp.mjs";
import "../error-BN1GdoFe.mjs";
import "../file-BgHDMp4o.mjs";
import "../getEnvVariable-58tQPflG.mjs";
import "../handleValueOrFn-2pqr_dC8.mjs";
import "../index-Dd9r-3AL.mjs";
import "../isomorphicAtob-DqIxJQZE.mjs";
import "../isomorphicBtoa-Cu4s1rFu.mjs";
import "../keys-CrHz1jNi.mjs";
import "../loadClerkJsScript-hLO3uTCg.mjs";
import "../loadScript-C6SUcPSp.mjs";
import "../localStorageBroadcastChannel-CNmeXxpW.mjs";
import "../poller-I92Dozmd.mjs";
import "../proxy-CTzlL3aE.mjs";
import "../underscore-D90CHGGe.mjs";
import "../url-Ty-8oURg.mjs";
import "../versionSelector-Btv3m_NV.mjs";
import "../object-CgEEf_DM.mjs";
import "../logger-CFsSyN6O.mjs";
import "../index-D_rS0fDT.mjs";
import "../pathMatcher-B-p8iMDM.mjs";
import "../netlifyCacheHandler-DaSimV39.mjs";
import "../index-CoUVmp_Q.mjs";
import React, { PropsWithChildren, ReactNode } from "react";
import { dequal } from "dequal";

//#region src/react/hooks/createContextAndHook.d.ts
/**
 * Assert that the context value exists, otherwise throw an error.
 *
 * @internal
 */
declare function assertContextExists(contextVal: unknown, msgOrCtx: string | React.Context<any>): asserts contextVal;
type Options$1 = {
  assertCtxFn?: (v: unknown, msg: string) => void;
};
type ContextOf<T$1> = React.Context<{
  value: T$1;
} | undefined>;
type UseCtxFn<T$1> = () => T$1;
/**
 * Create and return a Context and two hooks that return the context value.
 * The Context type is derived from the type passed in by the user.
 *
 * The first hook returned guarantees that the context exists so the returned value is always `CtxValue`
 * The second hook makes no guarantees, so the returned value can be `CtxValue | undefined`
 *
 * @internal
 */
declare const createContextAndHook: <CtxVal>(displayName: string, options?: Options$1) => [ContextOf<CtxVal>, UseCtxFn<CtxVal>, UseCtxFn<CtxVal | Partial<CtxVal>>];
//#endregion
//#region src/react/types.d.ts
type ValueOrSetter<T$1 = unknown> = (size: T$1 | ((_size: T$1) => T$1)) => void;
type CacheSetter<CData = any> = (data?: CData | ((currentData?: CData) => Promise<undefined | CData> | undefined | CData)) => Promise<CData | undefined>;
/**
 * @interface
 */
type PaginatedResources<T$1 = unknown, Infinite = false> = {
  /**
   * An array that contains the fetched data. For example, for the `memberships` attribute, data will be an array of [`OrganizationMembership`](https://clerk.com/docs/reference/javascript/types/organization-membership) objects.
   */
  data: T$1[];
  /**
   * The total count of data that exist remotely.
   */
  count: number;
  /**
   * Clerk's API response error object.
   */
  error: ClerkAPIResponseError | null;
  /**
   * A boolean that is `true` if there is an ongoing request and there is no fetched data.
   */
  isLoading: boolean;
  /**
   * A boolean that is `true` if there is an ongoing request or a revalidation.
   */
  isFetching: boolean;
  /**
   * A boolean that indicates the request failed.
   */
  isError: boolean;
  /**
   * The current page.
   */
  page: number;
  /**
   * The total amount of pages. It is calculated based on `count`, `initialPage`, and `pageSize`.
   */
  pageCount: number;
  /**
   * A function that triggers a specific page to be loaded.
   */
  fetchPage: ValueOrSetter<number>;
  /**
   *
   * A function that triggers the previous page to be loaded. This is the same as `fetchPage(page => Math.max(0, page - 1))`.
   */
  fetchPrevious: () => void;
  /**
   * A function that triggers the next page to be loaded. This is the same as `fetchPage(page => Math.min(pageCount, page + 1))`.
   */
  fetchNext: () => void;
  /**
   * A boolean that indicates if there are available pages to be fetched.
   */
  hasNextPage: boolean;
  /**
   * A boolean that indicates if there are available pages to be fetched.
   */
  hasPreviousPage: boolean;
  /**
   * A function that triggers a revalidation of the current page.
   */
  revalidate: () => Promise<void>;
  /**
   * A function that allows you to set the data manually.
   */
  setData: Infinite extends true ? CacheSetter<(ClerkPaginatedResponse<T$1> | undefined)[]> : CacheSetter<ClerkPaginatedResponse<T$1> | undefined>;
};
type PaginatedResourcesWithDefault<T$1> = { [K in keyof PaginatedResources<T$1>]: PaginatedResources<T$1>[K] extends boolean ? false : undefined };
/**
 * @inline
 */
type PaginatedHookConfig<T$1> = T$1 & {
  /**
   * If `true`, newly fetched data will be appended to the existing list rather than replacing it. Useful for implementing infinite scroll functionality.
   *
   * @default false
   */
  infinite?: boolean;
  /**
   * If `true`, the previous data will be kept in the cache until new data is fetched.
   *
   * @default false
   */
  keepPreviousData?: boolean;
};
/**
 * @interface
 */
type PagesOrInfiniteOptions = {
  /**
   * A number that specifies which page to fetch. For example, if `initialPage` is set to 10, it will skip the first 9 pages and fetch the 10th page.
   *
   * @default 1
   */
  initialPage?: number;
  /**
   * A number that specifies the maximum number of results to return per page.
   *
   * @default 10
   */
  pageSize?: number;
};
//#endregion
//#region src/react/hooks/useAPIKeys.swr.d.ts
/**
 * @internal
 */
type UseAPIKeysParams = PaginatedHookConfig<GetAPIKeysParams & {
  /**
   * If `true`, a request will be triggered when the hook is mounted.
   *
   * @default true
   */
  enabled?: boolean;
}>;
/**
 * @internal
 */
type UseAPIKeysReturn<T$1 extends UseAPIKeysParams> = PaginatedResources<APIKeyResource, T$1 extends {
  infinite: true;
} ? true : false>;
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
declare function useAPIKeys<T$1 extends UseAPIKeysParams>(params?: T$1): UseAPIKeysReturn<T$1>;
//#endregion
//#region src/react/hooks/useOrganization.d.ts
/**
 * @interface
 */
type UseOrganizationParams = {
  /**
   * If set to `true`, all default properties will be used.<br />
   * Otherwise, accepts an object with the following optional properties:
   * <ul>
   *  <li>`enrollmentMode`: A string that filters the domains by the provided [enrollment mode](https://clerk.com/docs/guides/organizations/add-members/verified-domains#enable-verified-domains).</li>
   *  <li>Any of the properties described in [Shared properties](#shared-properties).</li>
   * </ul>
   */
  domains?: true | PaginatedHookConfig<GetDomainsParams>;
  /**
   * If set to `true`, all default properties will be used.<br />
   * Otherwise, accepts an object with the following optional properties:
   * <ul>
   *  <li>`status`: A string that filters the membership requests by the provided status.</li>
   *  <li>Any of the properties described in [Shared properties](#shared-properties).</li>
   * </ul>
   */
  membershipRequests?: true | PaginatedHookConfig<GetMembershipRequestParams>;
  /**
   * If set to `true`, all default properties will be used.<br />
   * Otherwise, accepts an object with the following optional properties:
   * <ul>
   *  <li>`role`: An array of [`OrganizationCustomRoleKey`](https://clerk.com/docs/reference/javascript/types/organization-custom-role-key).</li>
   *  <li>`query`: A string that filters the memberships by the provided string.</li>
   *  <li>Any of the properties described in [Shared properties](#shared-properties).</li>
   * </ul>
   */
  memberships?: true | PaginatedHookConfig<GetMembersParams>;
  /**
   * If set to `true`, all default properties will be used.<br />
   * Otherwise, accepts an object with the following optional properties:
   * <ul>
   *  <li>`status`: A string that filters the invitations by the provided status.</li>
   *  <li>Any of the properties described in [Shared properties](#shared-properties).</li>
   * </ul>
   */
  invitations?: true | PaginatedHookConfig<GetInvitationsParams>;
};
/**
 * @interface
 */
type UseOrganizationReturn<T$1 extends UseOrganizationParams> = {
  /**
   * A boolean that indicates whether Clerk has completed initialization. Initially `false`, becomes `true` once Clerk loads.
   */
  isLoaded: false;
  /**
   * The currently Active Organization.
   */
  organization: undefined;
  /**
   * The current Organization membership.
   */
  membership: undefined;
  /**
   * Includes a paginated list of the Organization's domains.
   */
  domains: PaginatedResourcesWithDefault<OrganizationDomainResource>;
  /**
   * Includes a paginated list of the Organization's membership requests.
   */
  membershipRequests: PaginatedResourcesWithDefault<OrganizationMembershipRequestResource>;
  /**
   * Includes a paginated list of the Organization's memberships.
   */
  memberships: PaginatedResourcesWithDefault<OrganizationMembershipResource>;
  /**
   * Includes a paginated list of the Organization's invitations.
   */
  invitations: PaginatedResourcesWithDefault<OrganizationInvitationResource>;
} | {
  isLoaded: true;
  organization: OrganizationResource;
  membership: undefined;
  domains: PaginatedResourcesWithDefault<OrganizationDomainResource>;
  membershipRequests: PaginatedResourcesWithDefault<OrganizationMembershipRequestResource>;
  memberships: PaginatedResourcesWithDefault<OrganizationMembershipResource>;
  invitations: PaginatedResourcesWithDefault<OrganizationInvitationResource>;
} | {
  isLoaded: boolean;
  organization: OrganizationResource | null;
  membership: OrganizationMembershipResource | null | undefined;
  domains: PaginatedResources<OrganizationDomainResource, T$1['membershipRequests'] extends {
    infinite: true;
  } ? true : false> | null;
  membershipRequests: PaginatedResources<OrganizationMembershipRequestResource, T$1['membershipRequests'] extends {
    infinite: true;
  } ? true : false> | null;
  memberships: PaginatedResources<OrganizationMembershipResource, T$1['memberships'] extends {
    infinite: true;
  } ? true : false> | null;
  invitations: PaginatedResources<OrganizationInvitationResource, T$1['invitations'] extends {
    infinite: true;
  } ? true : false> | null;
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
declare function useOrganization<T$1 extends UseOrganizationParams>(params?: T$1): UseOrganizationReturn<T$1>;
//#endregion
//#region src/react/hooks/useOrganizationList.d.ts
/**
 * @interface
 */
type UseOrganizationListParams = {
  /**
   * If set to `true`, all default properties will be used.<br />
   * Otherwise, accepts an object with the following optional properties:
   *
   * <ul>
   *  <li>Any of the properties described in [Shared properties](#shared-properties).</li>
   * </ul>
   */
  userMemberships?: true | PaginatedHookConfig<GetUserOrganizationMembershipParams>;
  /**
   * If set to `true`, all default properties will be used.<br />
   * Otherwise, accepts an object with the following optional properties:
   *
   * <ul>
   *  <li>`status`: A string that filters the invitations by the provided status.</li>
   *  <li>Any of the properties described in [Shared properties](#shared-properties).</li>
   * </ul>
   */
  userInvitations?: true | PaginatedHookConfig<GetUserOrganizationInvitationsParams>;
  /**
   * If set to `true`, all default properties will be used.<br />
   * Otherwise, accepts an object with the following optional properties:
   *
   * <ul>
   *  <li>`status`: A string that filters the suggestions by the provided status.</li>
   *  <li>Any of the properties described in [Shared properties](#shared-properties).</li>
   * </ul>
   */
  userSuggestions?: true | PaginatedHookConfig<GetUserOrganizationSuggestionsParams>;
};
/**
 * @interface
 */
type UseOrganizationListReturn<T$1 extends UseOrganizationListParams> = {
  /**
   * A boolean that indicates whether Clerk has completed initialization and there is an authenticated user. Initially `false`, becomes `true` once Clerk loads with a user.
   */
  isLoaded: false;
  /**
   * A function that returns a `Promise` which resolves to the newly created `Organization`.
   */
  createOrganization: undefined;
  /**
   * A function that sets the active session and/or Organization.
   */
  setActive: undefined;
  /**
   * Returns `PaginatedResources` which includes a list of the user's Organization memberships.
   */
  userMemberships: PaginatedResourcesWithDefault<OrganizationMembershipResource>;
  /**
   * Returns `PaginatedResources` which includes a list of the user's Organization invitations.
   */
  userInvitations: PaginatedResourcesWithDefault<UserOrganizationInvitationResource>;
  /**
   * Returns `PaginatedResources` which includes a list of suggestions for Organizations that the user can join.
   */
  userSuggestions: PaginatedResourcesWithDefault<OrganizationSuggestionResource>;
} | {
  isLoaded: boolean;
  createOrganization: (CreateOrganizationParams: CreateOrganizationParams) => Promise<OrganizationResource>;
  setActive: SetActive;
  userMemberships: PaginatedResources<OrganizationMembershipResource, T$1['userMemberships'] extends {
    infinite: true;
  } ? true : false>;
  userInvitations: PaginatedResources<UserOrganizationInvitationResource, T$1['userInvitations'] extends {
    infinite: true;
  } ? true : false>;
  userSuggestions: PaginatedResources<OrganizationSuggestionResource, T$1['userSuggestions'] extends {
    infinite: true;
  } ? true : false>;
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
declare function useOrganizationList<T$1 extends UseOrganizationListParams>(params?: T$1): UseOrganizationListReturn<T$1>;
//#endregion
//#region src/react/hooks/useAttemptToEnableOrganizations.d.ts
/**
 * Attempts to enable the organizations environment setting for a given caller
 *
 * @internal
 */
declare function useAttemptToEnableOrganizations(caller: 'useOrganization' | 'useOrganizationList'): void;
//#endregion
//#region src/react/hooks/useSafeLayoutEffect.d.ts
/**
 * @internal
 */
declare const useSafeLayoutEffect: typeof React.useEffect;
//#endregion
//#region src/react/hooks/useSession.d.ts
type UseSession = () => UseSessionReturn;
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
declare const useSession: UseSession;
//#endregion
//#region src/react/hooks/useSessionList.d.ts
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
declare const useSessionList: () => UseSessionListReturn;
//#endregion
//#region src/react/hooks/useUser.d.ts
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
declare function useUser(): UseUserReturn;
//#endregion
//#region src/react/hooks/useClerk.d.ts
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
declare const useClerk: () => LoadedClerk;
//#endregion
//#region src/react/hooks/useDeepEqualMemo.d.ts
type UseMemoFactory<T$1> = () => T$1;
type UseMemoDependencyArray = Exclude<Parameters<typeof React.useMemo>[1], 'undefined'>;
type UseDeepEqualMemo = <T>(factory: UseMemoFactory<T>, dependencyArray: UseMemoDependencyArray) => T;
/**
 * @internal
 */
declare const useDeepEqualMemo: UseDeepEqualMemo;
/**
 * @internal
 */
declare const isDeeplyEqual: typeof dequal;
//#endregion
//#region src/react/hooks/useReverification.d.ts
type ExcludeClerkError<T$1> = T$1 extends {
  clerk_error: any;
} ? never : T$1;
/**
 * @interface
 */
type NeedsReverificationParameters = {
  /**
   * Marks the reverification process as cancelled and rejects the original request.
   */
  cancel: () => void;
  /**
   * Marks the reverification process as complete and retries the original request.
   */
  complete: () => void;
  /**
   * The verification level required for the reverification process.
   */
  level: SessionVerificationLevel | undefined;
};
/**
 * The optional options object.
 *
 * @interface
 */
type UseReverificationOptions = {
  /**
   * Handler for the reverification process. Opts out of using the default UI. Use this to build a custom UI.
   *
   * @param properties - Callbacks and info to control the reverification flow.
   * @param properties.cancel - A function that will cancel the reverification process.
   * @param properties.complete - A function that will retry the original request after reverification.
   * @param properties.level - The level returned with the reverification hint.
   */
  onNeedsReverification?: (properties: NeedsReverificationParameters) => void;
};
/**
 * @interface
 */
type UseReverificationResult<Fetcher$1 extends (...args: any[]) => Promise<any> | undefined> = (...args: Parameters<Fetcher$1>) => Promise<ExcludeClerkError<Awaited<ReturnType<Fetcher$1>>>>;
/**
 * @interface
 */
type UseReverification = <Fetcher extends (...args: any[]) => Promise<any> | undefined, Options extends UseReverificationOptions = UseReverificationOptions>(
/**
 * A function that returns a promise.
 */
fetcher: Fetcher,
/**
 * Optional configuration object extending [`UseReverificationOptions`](https://clerk.com/docs/reference/hooks/use-reverification#use-reverification-options).
 */
options?: Options) => UseReverificationResult<Fetcher>;
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
declare const useReverification: UseReverification;
//#endregion
//#region src/react/hooks/createBillingPaginatedHook.d.ts
/**
 * @interface
 */
interface HookParams extends PaginatedHookConfig<PagesOrInfiniteOptions & {
  /**
   * If `true`, a request will be triggered when the hook is mounted.
   *
   * @default true
   */
  enabled?: boolean;
  /**
   * On `cache` mode, no request will be triggered when the hook is mounted and the data will be fetched from the cache.
   *
   * @default undefined
   *
   * @hidden
   *
   * @experimental
   */
  __experimental_mode?: 'cache';
}> {
  /**
   * Specifies whether to fetch for the current user or Organization.
   *
   * @default 'user'
   */
  for?: ForPayerType;
}
//#endregion
//#region src/react/hooks/useStatements.d.ts
/**
 * @internal
 */
declare const useStatements: <T extends HookParams>(params?: T | undefined) => PaginatedResources<BillingStatementResource, T extends {
  infinite: true;
} ? true : false>;
//#endregion
//#region src/react/hooks/usePaymentAttempts.d.ts
/**
 * @internal
 */
declare const usePaymentAttempts: <T extends HookParams>(params?: T | undefined) => PaginatedResources<BillingPaymentResource, T extends {
  infinite: true;
} ? true : false>;
//#endregion
//#region src/react/hooks/usePaymentMethods.d.ts
/**
 * @internal
 */
declare const usePaymentMethods: <T extends HookParams>(params?: T | undefined) => PaginatedResources<BillingPaymentMethodResource, T extends {
  infinite: true;
} ? true : false>;
//#endregion
//#region src/react/hooks/usePlans.d.ts
/**
 * @internal
 */
declare const usePlans: <T extends HookParams>(params?: T | undefined) => PaginatedResources<BillingPlanResource, T extends {
  infinite: true;
} ? true : false>;
//#endregion
//#region src/react/hooks/useSubscription.types.d.ts
/**
 * @interface
 */
type UseSubscriptionParams = {
  /**
   * Specifies whether to fetch the Subscription for an Organization or a user.
   *
   * @default 'user'
   */
  for?: ForPayerType;
  /**
   * If true, the previous data will be kept in the cache until new data is fetched.
   *
   * @default false
   */
  keepPreviousData?: boolean;
  /**
   * If `true`, a request will be triggered when the hook is mounted.
   *
   * @default true
   */
  enabled?: boolean;
};
/**
 * @interface
 */
type SubscriptionResult = {
  /**
   * The subscription object, `undefined` before the first fetch, or `null` if no subscription exists.
   */
  data: BillingSubscriptionResource | undefined | null;
  /**
   * Any error that occurred during the data fetch, or `undefined` if no error occurred.
   */
  error: Error | undefined;
  /**
   * A boolean that indicates whether the initial data is still being fetched.
   */
  isLoading: boolean;
  /**
   * A boolean that indicates whether any request is still in flight, including background updates.
   */
  isFetching: boolean;
  /**
   * Function to manually revalidate or refresh the subscription data.
   */
  revalidate: () => Promise<void> | void;
};
//#endregion
//#region src/react/hooks/useSubscription.swr.d.ts
/**
 * This is the existing implementation of useSubscription using SWR.
 * It is kept here for backwards compatibility until our next major version.
 *
 * @internal
 */
declare function useSubscription(params?: UseSubscriptionParams): SubscriptionResult;
//#endregion
//#region src/react/contexts.d.ts
declare const ClerkInstanceContext: React.Context<{
    value: LoadedClerk;
  } | undefined>, useClerkInstanceContext: () => LoadedClerk;
declare const UserContext: React.Context<{
    value: UserResource | null | undefined;
  } | undefined>, useUserContext: () => UserResource | null | undefined;
declare const ClientContext: React.Context<{
    value: ClientResource | null | undefined;
  } | undefined>, useClientContext: () => ClientResource | null | undefined;
declare const SessionContext: React.Context<{
    value: SignedInSessionResource | null | undefined;
  } | undefined>, useSessionContext: () => SignedInSessionResource | null | undefined;
declare const OptionsContext: React.Context<ClerkOptions>;
/**
 * @interface
 */
type UseCheckoutOptions = {
  /**
   * Specifies if the checkout is for an Organization.
   *
   * @default 'user'
   */
  for?: ForPayerType;
  /**
   * The billing period for the Plan.
   */
  planPeriod: BillingSubscriptionPlanPeriod;
  /**
   * The ID of the Subscription Plan to check out (e.g. `cplan_xxx`).
   */
  planId: string;
};
declare const __experimental_CheckoutProvider: ({
  children,
  ...rest
}: PropsWithChildren<UseCheckoutOptions>) => React.JSX.Element;
/**
 * @internal
 */
declare function useOptionsContext(): ClerkOptions;
type OrganizationContextProps = {
  organization: OrganizationResource | null | undefined;
};
declare const useOrganizationContext: () => {
  organization: OrganizationResource | null | undefined;
};
declare const OrganizationProvider: ({
  children,
  organization,
  swrConfig
}: PropsWithChildren<OrganizationContextProps & {
  swrConfig?: any;
}>) => React.JSX.Element;
/**
 * @internal
 */
declare function useAssertWrappedByClerkProvider(displayNameOrFn: string | (() => void)): void;
//#endregion
//#region src/react/hooks/useCheckout.d.ts
/**
 * Utility type that removes function properties from a type.
 */
type RemoveFunctions<T$1> = { [K in keyof T$1 as T$1[K] extends ((...args: any[]) => any) ? never : K]: T$1[K] };
/**
 * Utility type that makes all properties `null`.
 */
type ForceNull<T$1> = { [K in keyof T$1]: null };
/**
 * @inline
 */
type CheckoutProperties = Omit<RemoveFunctions<BillingCheckoutResource>, 'pathRoot' | 'status'>;
/**
 * @inline
 */
type FetchStatusAndError = {
  /**
   * Returns an error object if any part of the checkout process fails.
   */
  error: ClerkAPIResponseError;
  /**
   * The data fetching status.
   */
  fetchStatus: 'error';
} | {
  error: null;
  fetchStatus: 'idle' | 'fetching';
};
/**
 * @inline
 * On status === 'needs_initialization', all properties are null.
 * On status === 'needs_confirmation' or 'completed', all properties are defined the same as the BillingCheckoutResource.
 */
type CheckoutPropertiesPerStatus = ({
  /**
   * @inline
   * The current status of the checkout session. The following statuses are possible:
   *  <ul>
   *  <li>`needs_initialization`: The checkout hasn't started but the hook is mounted. Call `start()` to continue.</li>
   *  <li>`needs_confirmation`: The checkout has been initialized and is awaiting confirmation. Call `confirm()` to continue.</li>
   *  <li>`completed`: The checkout has been successfully confirmed. Call `finalize()` to complete the checkout.</li>
   * </ul>
   */
  status: Extract<__experimental_CheckoutCacheState['status'], 'needs_initialization'>;
} & ForceNull<CheckoutProperties>) | ({
  status: Extract<__experimental_CheckoutCacheState['status'], 'needs_confirmation' | 'completed'>;
} & CheckoutProperties);
/**
 * @interface
 */
type UseCheckoutReturn = FetchStatusAndError & CheckoutPropertiesPerStatus & {
  /**
   * A function that confirms and finalizes the checkout process, usually after the user has provided and validated payment information.
   */
  confirm: __experimental_CheckoutInstance['confirm'];
  /**
   * A function that initializes the checkout process by creating a checkout resource on the server.
   */
  start: __experimental_CheckoutInstance['start'];
  /**
   * A function that clears the current checkout state from the cache.
   */
  clear: () => void;
  /**
   * A function that finalizes the checkout process. Can optionally accept a `navigate()` function to redirect the user after completion.
   */
  finalize: (params?: {
    navigate?: SetActiveNavigate;
  }) => void;
  getState: () => __experimental_CheckoutCacheState;
  /**
   * A boolean that indicates if the `start()` method is in progress.
   */
  isStarting: boolean;
  /**
   * A boolean that indicates if the `confirm()` method is in progress.
   */
  isConfirming: boolean;
};
type __experimental_UseCheckoutReturn = {
  checkout: UseCheckoutReturn;
};
type UseCheckoutParams = Parameters<typeof __experimental_CheckoutProvider>[0];
/**
 * @function
 *
 * @param [options] - An object containing the configuration for the checkout flow.
 *
 * **Required** if the hook is used without a `<CheckoutProvider />` wrapping the component tree.
 */
declare const useCheckout: (options?: UseCheckoutParams) => __experimental_UseCheckoutReturn;
//#endregion
//#region src/react/hooks/useStatementQuery.types.d.ts
/**
 * @internal
 */
type UseStatementQueryParams = {
  /**
   * The statement ID to fetch.
   */
  statementId?: string | null;
  /**
   * Specifies whether to fetch the statement for an organization or a user.
   *
   * @default 'user'
   */
  for?: ForPayerType;
  /**
   * If true, the previous data will be kept in the cache until new data is fetched.
   *
   * @default false
   */
  keepPreviousData?: boolean;
  /**
   * If `true`, a request will be triggered when the hook is mounted.
   *
   * @default true
   */
  enabled?: boolean;
};
/**
 * @internal
 */
type StatementQueryResult = {
  /**
   * The statement object, `undefined` before the first fetch, or `null` if no statement exists.
   */
  data: BillingStatementResource | undefined | null;
  /**
   * Any error that occurred during the data fetch, or `undefined` if no error occurred.
   */
  error: ClerkAPIResponseError$1 | null;
  /**
   * A boolean that indicates whether the initial data is still being fetched.
   */
  isLoading: boolean;
  /**
   * A boolean that indicates whether any request is still in flight, including background updates.
   */
  isFetching: boolean;
};
//#endregion
//#region src/react/hooks/useStatementQuery.swr.d.ts
/**
 * This is the existing implementation of useStatementQuery using SWR.
 * It is kept here for backwards compatibility until our next major version.
 *
 * @internal
 */
declare function __internal_useStatementQuery(params?: UseStatementQueryParams): StatementQueryResult;
//#endregion
//#region src/react/hooks/usePlanDetailsQuery.types.d.ts
/**
 * @internal
 */
type UsePlanDetailsQueryParams = {
  /**
   * The plan ID to fetch.
   */
  planId?: string | null;
  /**
   * Initial plan data to use before fetching.
   */
  initialPlan?: BillingPlanResource | null;
  /**
   * If true, the previous data will be kept in the cache until new data is fetched.
   *
   * @default true
   */
  keepPreviousData?: boolean;
  /**
   * If `true`, a request will be triggered when the hook is mounted.
   *
   * @default true
   */
  enabled?: boolean;
};
/**
 * @internal
 */
type PlanDetailsQueryResult = {
  /**
   * The plan object, `undefined` before the first fetch, or `null` if no plan exists.
   */
  data: BillingPlanResource | undefined | null;
  /**
   * Any error that occurred during the data fetch, or `undefined` if no error occurred.
   */
  error: ClerkAPIResponseError | null;
  /**
   * A boolean that indicates whether the initial data is still being fetched.
   */
  isLoading: boolean;
  /**
   * A boolean that indicates whether any request is still in flight, including background updates.
   */
  isFetching: boolean;
};
//#endregion
//#region src/react/hooks/usePlanDetailsQuery.swr.d.ts
/**
 * This is the existing implementation of usePlanDetailsQuery using SWR.
 * It is kept here for backwards compatibility until our next major version.
 *
 * @internal
 */
declare function usePlanDetailsQuery(params?: UsePlanDetailsQueryParams): PlanDetailsQueryResult;
//#endregion
//#region src/react/hooks/usePaymentAttemptQuery.types.d.ts
/**
 * @internal
 */
type UsePaymentAttemptQueryParams = {
  /**
   * The payment attempt ID to fetch.
   */
  paymentAttemptId: string;
  /**
   * Specifies whether to fetch the payment attempt for an organization or a user.
   *
   * @default 'user'
   */
  for?: ForPayerType;
  /**
   * If true, the previous data will be kept in the cache until new data is fetched.
   *
   * @default false
   */
  keepPreviousData?: boolean;
  /**
   * If `true`, a request will be triggered when the hook is mounted.
   *
   * @default true
   */
  enabled?: boolean;
};
/**
 * @internal
 */
type PaymentAttemptQueryResult = {
  /**
   * The payment attempt object, `undefined` before the first fetch, or `null` if no payment attempt exists.
   */
  data: BillingPaymentResource | undefined | null;
  /**
   * Any error that occurred during the data fetch, or `undefined` if no error occurred.
   */
  error: ClerkAPIResponseError | null;
  /**
   * A boolean that indicates whether the initial data is still being fetched.
   */
  isLoading: boolean;
  /**
   * A boolean that indicates whether any request is still in flight, including background updates.
   */
  isFetching: boolean;
};
//#endregion
//#region src/react/hooks/usePaymentAttemptQuery.swr.d.ts
/**
 * This is the existing implementation of usePaymentAttemptQuery using SWR.
 * It is kept here for backwards compatibility until our next major version.
 *
 * @internal
 */
declare function __internal_usePaymentAttemptQuery(params: UsePaymentAttemptQueryParams): PaymentAttemptQueryResult;
//#endregion
//#region src/react/billing/payment-element.d.ts
type PaymentElementError = {
  gateway: 'stripe';
  error: {
    /**
     * For some errors that could be handled programmatically, a short string indicating the [error code](https://stripe.com/docs/error-codes) reported.
     */
    code?: string;
    message?: string;
    type: string;
  };
};
type internalStripeAppearance = {
  colorPrimary: string;
  colorBackground: string;
  colorText: string;
  colorTextSecondary: string;
  colorSuccess: string;
  colorDanger: string;
  colorWarning: string;
  fontWeightNormal: string;
  fontWeightMedium: string;
  fontWeightBold: string;
  fontSizeXl: string;
  fontSizeLg: string;
  fontSizeSm: string;
  fontSizeXs: string;
  borderRadius: string;
  spacingUnit: string;
};
/**
 * @interface
 */
type PaymentElementProviderProps = {
  /**
   * An optional checkout resource object. When provided, the payment element is scoped to the specific checkout session.
   */
  checkout?: BillingCheckoutResource | ReturnType<typeof useCheckout>['checkout'];
  /**
   * An optional object to customize the appearance of the Stripe Payment Element. This allows you to match the form's styling to your application's theme.
   */
  stripeAppearance?: internalStripeAppearance;
  /**
   * Specifies whether to fetch for the current user or Organization.
   *
   * @default 'user'
   */
  for?: ForPayerType;
  /**
   * An optional description to display to the user within the payment element UI.
   */
  paymentDescription?: string;
};
declare const PaymentElementProvider: ({
  children,
  ...props
}: PropsWithChildren<PaymentElementProviderProps>) => React.JSX.Element;
/**
 * @interface
 */
type PaymentElementProps = {
  /**
   * Optional fallback content, such as a loading skeleton, to display while the payment form is being initialized.
   */
  fallback?: ReactNode;
};
declare const PaymentElement: ({
  fallback
}: PaymentElementProps) => React.JSX.Element;
/**
 * @interface
 */
type UsePaymentElementReturn = {
  /**
   * A function that submits the payment form data to the payment provider. It returns a promise that resolves with either a `data` object containing a payment token on success, or an `error` object on failure.
   */
  submit: () => Promise<{
    data: {
      gateway: 'stripe';
      paymentToken: string;
    };
    error: null;
  } | {
    data: null;
    error: PaymentElementError;
  }>;
  /**
   * A function that resets the payment form to its initial, empty state.
   */
  reset: () => Promise<void>;
  /**
   * A boolean that indicates if the payment form UI has been rendered and is ready for user input. This is useful for disabling a submit button until the form is interactive.
   */
  isFormReady: boolean;
} & ({
  /**
   * An object containing information about the initialized payment provider. It is `undefined` until `isProviderReady` is `true`.
   */
  provider: {
    name: 'stripe';
  };
  /**
   * A boolean that indicates if the underlying payment provider (e.g. Stripe) has been fully initialized.
   */
  isProviderReady: true;
} | {
  provider: undefined;
  isProviderReady: false;
});
declare const usePaymentElement: () => UsePaymentElementReturn;
//#endregion
export { ClerkInstanceContext, ClientContext, OptionsContext, OrganizationProvider, PaymentElementProps, PaymentElementProviderProps, SessionContext, UsePaymentElementReturn, type UseSubscriptionParams, UserContext, __experimental_CheckoutProvider, PaymentElement as __experimental_PaymentElement, PaymentElementProvider as __experimental_PaymentElementProvider, useAPIKeys as __experimental_useAPIKeys, useCheckout as __experimental_useCheckout, usePaymentAttempts as __experimental_usePaymentAttempts, usePaymentElement as __experimental_usePaymentElement, usePaymentMethods as __experimental_usePaymentMethods, usePlans as __experimental_usePlans, useStatements as __experimental_useStatements, useSubscription as __experimental_useSubscription, __internal_usePaymentAttemptQuery, usePlanDetailsQuery as __internal_usePlanDetailsQuery, __internal_useStatementQuery, assertContextExists, createContextAndHook, isDeeplyEqual, useAssertWrappedByClerkProvider, useAttemptToEnableOrganizations, useClerk, useClerkInstanceContext, useClientContext, useDeepEqualMemo, useOptionsContext, useOrganization, useOrganizationContext, useOrganizationList, useReverification, useSafeLayoutEffect, useSession, useSessionContext, useSessionList, useUser, useUserContext };
//# sourceMappingURL=index.d.mts.map