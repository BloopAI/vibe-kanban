import * as _clerk_shared_types from '@clerk/shared/types';
import { HandleOAuthCallbackParams, ProtectProps as ProtectProps$1, PendingSessionOptions, UseAuthReturn } from '@clerk/shared/types';
import React from 'react';
import { W as WithClerkProp } from './types-CFOQkf-D.js';

declare const SignedIn: ({ children, treatPendingAsSignedOut }: React.PropsWithChildren<PendingSessionOptions>) => React.ReactNode;
declare const SignedOut: ({ children, treatPendingAsSignedOut }: React.PropsWithChildren<PendingSessionOptions>) => React.ReactNode;
declare const ClerkLoaded: ({ children }: React.PropsWithChildren<unknown>) => React.ReactNode;
declare const ClerkLoading: ({ children }: React.PropsWithChildren<unknown>) => React.ReactNode;
declare const ClerkFailed: ({ children }: React.PropsWithChildren<unknown>) => React.ReactNode;
declare const ClerkDegraded: ({ children }: React.PropsWithChildren<unknown>) => React.ReactNode;
type ProtectProps = React.PropsWithChildren<ProtectProps$1 & {
    fallback?: React.ReactNode;
} & PendingSessionOptions>;
/**
 * Use `<Protect/>` in order to prevent unauthenticated or unauthorized users from accessing the children passed to the component.
 *
 * Examples:
 * ```
 * <Protect permission="a_permission_key" />
 * <Protect role="a_role_key" />
 * <Protect condition={(has) => has({permission:"a_permission_key"})} />
 * <Protect condition={(has) => has({role:"a_role_key"})} />
 * <Protect fallback={<p>Unauthorized</p>} />
 * ```
 */
declare const Protect: ({ children, fallback, treatPendingAsSignedOut, ...restAuthorizedParams }: ProtectProps) => React.ReactNode;
declare const RedirectToSignIn: {
    (props: _clerk_shared_types.Without<WithClerkProp<_clerk_shared_types.SignInRedirectOptions>, "clerk">): React.JSX.Element | null;
    displayName: string;
};
declare const RedirectToSignUp: {
    (props: _clerk_shared_types.Without<WithClerkProp<_clerk_shared_types.SignUpRedirectOptions>, "clerk">): React.JSX.Element | null;
    displayName: string;
};
declare const RedirectToTasks: {
    (props: _clerk_shared_types.Without<WithClerkProp<_clerk_shared_types.TasksRedirectOptions>, "clerk">): React.JSX.Element | null;
    displayName: string;
};
/**
 * @function
 * @deprecated Use [`redirectToUserProfile()`](https://clerk.com/docs/reference/javascript/clerk#redirect-to-user-profile) instead.
 */
declare const RedirectToUserProfile: {
    (props: _clerk_shared_types.Without<{
        clerk: _clerk_shared_types.LoadedClerk;
        component?: string;
    }, "clerk">): React.JSX.Element | null;
    displayName: string;
};
/**
 * @function
 * @deprecated Use [`redirectToOrganizationProfile()`](https://clerk.com/docs/reference/javascript/clerk#redirect-to-organization-profile) instead.
 */
declare const RedirectToOrganizationProfile: {
    (props: _clerk_shared_types.Without<{
        clerk: _clerk_shared_types.LoadedClerk;
        component?: string;
    }, "clerk">): React.JSX.Element | null;
    displayName: string;
};
/**
 * @function
 * @deprecated Use [`redirectToCreateOrganization()`](https://clerk.com/docs/reference/javascript/clerk#redirect-to-create-organization) instead.
 */
declare const RedirectToCreateOrganization: {
    (props: _clerk_shared_types.Without<{
        clerk: _clerk_shared_types.LoadedClerk;
        component?: string;
    }, "clerk">): React.JSX.Element | null;
    displayName: string;
};
declare const AuthenticateWithRedirectCallback: {
    (props: _clerk_shared_types.Without<WithClerkProp<HandleOAuthCallbackParams>, "clerk">): React.JSX.Element | null;
    displayName: string;
};
declare const MultisessionAppSupport: ({ children }: React.PropsWithChildren<unknown>) => React.JSX.Element;

/**
 * @inline
 */
type UseAuthOptions = Record<string, any> | PendingSessionOptions | undefined | null;
/**
 * The `useAuth()` hook provides access to the current user's authentication state and methods to manage the active session.
 *
 * > [!NOTE]
 * > To access auth data server-side, see the [`Auth` object reference doc](https://clerk.com/docs/reference/backend/types/auth-object).
 *
 * <If sdk="nextjs">
 * By default, Next.js opts all routes into static rendering. If you need to opt a route or routes into dynamic rendering because you need to access the authentication data at request time, you can create a boundary by passing the `dynamic` prop to `<ClerkProvider>`. See the [guide on rendering modes](https://clerk.com/docs/guides/development/rendering-modes) for more information, including code examples.
 * </If>
 *
 * @unionReturnHeadings
 * ["Initialization", "Signed out", "Signed in (no active organization)", "Signed in (with active organization)"]
 *
 * @param [initialAuthStateOrOptions] - An object containing the initial authentication state or options for the `useAuth()` hook. If not provided, the hook will attempt to derive the state from the context. `treatPendingAsSignedOut` is a boolean that indicates whether pending sessions are considered as signed out or not. Defaults to `true`.
 *
 * @function
 *
 * @example
 *
 * The following example demonstrates how to use the `useAuth()` hook to access the current auth state, like whether the user is signed in or not. It also includes a basic example for using the `getToken()` method to retrieve a session token for fetching data from an external resource.
 *
 * <Tabs items='React,Next.js'>
 * <Tab>
 *
 * ```tsx {{ filename: 'src/pages/ExternalDataPage.tsx' }}
 * import { useAuth } from '@clerk/clerk-react'
 *
 * export default function ExternalDataPage() {
 *   const { userId, sessionId, getToken, isLoaded, isSignedIn } = useAuth()
 *
 *   const fetchExternalData = async () => {
 *     const token = await getToken()
 *
 *     // Fetch data from an external API
 *     const response = await fetch('https://api.example.com/data', {
 *       headers: {
 *         Authorization: `Bearer ${token}`,
 *       },
 *     })
 *
 *     return response.json()
 *   }
 *
 *   if (!isLoaded) {
 *     return <div>Loading...</div>
 *   }
 *
 *   if (!isSignedIn) {
 *     return <div>Sign in to view this page</div>
 *   }
 *
 *   return (
 *     <div>
 *       <p>
 *         Hello, {userId}! Your current active session is {sessionId}.
 *       </p>
 *       <button onClick={fetchExternalData}>Fetch Data</button>
 *     </div>
 *   )
 * }
 * ```
 *
 * </Tab>
 * <Tab>
 *
 * {@include ../../docs/use-auth.md#nextjs-01}
 *
 * </Tab>
 * </Tabs>
 */
declare const useAuth: (initialAuthStateOrOptions?: UseAuthOptions) => UseAuthReturn;
/**
 * A hook that derives and returns authentication state and utility functions based on the provided auth object.
 *
 * @param authObject - An object containing authentication-related properties and functions.
 *
 * @returns A derived authentication state with helper methods. If the authentication state is invalid, an error is thrown.
 *
 * @remarks
 * This hook inspects session, user, and organization information to determine the current authentication state.
 * It returns an object that includes various properties such as whether the state is loaded, if a user is signed in,
 * session and user identifiers, Organization Roles, and a `has` function for authorization checks.
 * Additionally, it provides `signOut` and `getToken` functions if applicable.
 *
 * @example
 * ```tsx
 * const {
 *   isLoaded,
 *   isSignedIn,
 *   userId,
 *   orgId,
 *   has,
 *   signOut,
 *   getToken
 * } = useDerivedAuth(authObject);
 * ```
 */
declare function useDerivedAuth(authObject: any, { treatPendingAsSignedOut }?: PendingSessionOptions): UseAuthReturn;

export { AuthenticateWithRedirectCallback as A, ClerkDegraded as C, MultisessionAppSupport as M, Protect as P, RedirectToCreateOrganization as R, SignedIn as S, ClerkFailed as a, ClerkLoaded as b, ClerkLoading as c, RedirectToOrganizationProfile as d, RedirectToSignIn as e, RedirectToSignUp as f, RedirectToTasks as g, RedirectToUserProfile as h, SignedOut as i, type ProtectProps as j, useAuth as k, useDerivedAuth as u };
