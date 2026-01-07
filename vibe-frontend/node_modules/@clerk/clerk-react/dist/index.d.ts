import * as _clerk_shared_types from '@clerk/shared/types';
import { Without, APIKeysProps, CreateOrganizationProps, OrganizationListProps, OrganizationProfileProps, OrganizationSwitcherProps, SignInProps, SignUpProps, TaskChooseOrganizationProps, TaskResetPasswordProps, UserAvatarProps, UserButtonProps, UserProfileProps, WaitlistProps, SignInButtonProps, SignOutOptions, SignUpButtonProps, SignInResource, CreateEmailLinkFlowReturn, SignInStartEmailLinkFlowParams, SignUpResource, StartEmailLinkFlowParams, EmailAddressResource, UseSignInReturn, UseSignUpReturn } from '@clerk/shared/types';
import React, { ReactNode, PropsWithChildren } from 'react';
import { W as WithClerkProp, O as OrganizationProfilePageProps, a as OrganizationProfileLinkProps, U as UserProfilePageProps, b as UserProfileLinkProps, c as UserButtonActionProps, d as UserButtonLinkProps, S as SignInWithMetamaskButtonProps, C as ClerkProviderProps } from './types-CFOQkf-D.js';
export { B as BrowserClerk, e as ClerkProp, H as HeadlessBrowserClerk } from './types-CFOQkf-D.js';
export { A as AuthenticateWithRedirectCallback, C as ClerkDegraded, a as ClerkFailed, b as ClerkLoaded, c as ClerkLoading, P as Protect, j as ProtectProps, R as RedirectToCreateOrganization, d as RedirectToOrganizationProfile, e as RedirectToSignIn, f as RedirectToSignUp, g as RedirectToTasks, h as RedirectToUserProfile, S as SignedIn, i as SignedOut, k as useAuth } from './useAuth-fq1pQd_y.js';
export { __experimental_CheckoutProvider, __experimental_PaymentElement, __experimental_PaymentElementProvider, __experimental_useCheckout, __experimental_usePaymentElement, useClerk, useOrganization, useOrganizationList, useReverification, useSession, useSessionList, useUser } from '@clerk/shared/react';

type FallbackProp = {
    /**
     * An optional element to render while the component is mounting.
     */
    fallback?: ReactNode;
};
type UserProfileExportType = typeof _UserProfile & {
    Page: typeof UserProfilePage;
    Link: typeof UserProfileLink;
};
type UserButtonExportType = typeof _UserButton & {
    UserProfilePage: typeof UserProfilePage;
    UserProfileLink: typeof UserProfileLink;
    MenuItems: typeof MenuItems;
    Action: typeof MenuAction;
    Link: typeof MenuLink;
    /**
     * The `<Outlet />` component can be used in conjunction with `asProvider` in order to control rendering
     * of the `<UserButton />` without affecting its configuration or any custom pages that could be mounted
     * @experimental This API is experimental and may change at any moment.
     */
    __experimental_Outlet: typeof UserButtonOutlet;
};
type UserButtonPropsWithoutCustomPages = Without<UserButtonProps, 'userProfileProps' | '__experimental_asStandalone'> & {
    userProfileProps?: Pick<UserProfileProps, 'additionalOAuthScopes' | 'appearance' | 'apiKeysProps'>;
    /**
     * Adding `asProvider` will defer rendering until the `<Outlet />` component is mounted.
     *
     * @experimental This API is experimental and may change at any moment.
     * @default undefined
     */
    __experimental_asProvider?: boolean;
};
type OrganizationProfileExportType = typeof _OrganizationProfile & {
    Page: typeof OrganizationProfilePage;
    Link: typeof OrganizationProfileLink;
};
type OrganizationSwitcherExportType = typeof _OrganizationSwitcher & {
    OrganizationProfilePage: typeof OrganizationProfilePage;
    OrganizationProfileLink: typeof OrganizationProfileLink;
    /**
     * The `<Outlet />` component can be used in conjunction with `asProvider` in order to control rendering
     * of the `<OrganizationSwitcher />` without affecting its configuration or any custom pages that could be mounted
     *
     * @experimental This API is experimental and may change at any moment.
     */
    __experimental_Outlet: typeof OrganizationSwitcherOutlet;
};
type OrganizationSwitcherPropsWithoutCustomPages = Without<OrganizationSwitcherProps, 'organizationProfileProps' | '__experimental_asStandalone'> & {
    organizationProfileProps?: Pick<OrganizationProfileProps, 'appearance'>;
    /**
     * Adding `asProvider` will defer rendering until the `<Outlet />` component is mounted.
     *
     * @experimental This API is experimental and may change at any moment.
     * @default undefined
     */
    __experimental_asProvider?: boolean;
};
declare const SignIn: {
    (props: Without<WithClerkProp<SignInProps & FallbackProp>, "clerk">): React.JSX.Element | null;
    displayName: string;
};
declare const SignUp: {
    (props: Without<WithClerkProp<SignUpProps & FallbackProp>, "clerk">): React.JSX.Element | null;
    displayName: string;
};
declare function UserProfilePage({ children }: PropsWithChildren<UserProfilePageProps>): React.JSX.Element;
declare function UserProfileLink({ children }: PropsWithChildren<UserProfileLinkProps>): React.JSX.Element;
declare const _UserProfile: {
    (props: Without<WithClerkProp<PropsWithChildren<Without<UserProfileProps, "customPages">> & FallbackProp>, "clerk">): React.JSX.Element | null;
    displayName: string;
};
declare const UserProfile: UserProfileExportType;
declare const _UserButton: {
    (props: Without<WithClerkProp<PropsWithChildren<UserButtonPropsWithoutCustomPages> & FallbackProp>, "clerk">): React.JSX.Element | null;
    displayName: string;
};
declare function MenuItems({ children }: PropsWithChildren): React.JSX.Element;
declare function MenuAction({ children }: PropsWithChildren<UserButtonActionProps>): React.JSX.Element;
declare function MenuLink({ children }: PropsWithChildren<UserButtonLinkProps>): React.JSX.Element;
declare function UserButtonOutlet(outletProps: Without<UserButtonProps, 'userProfileProps'>): React.JSX.Element;
declare const UserButton: UserButtonExportType;
declare function OrganizationProfilePage({ children }: PropsWithChildren<OrganizationProfilePageProps>): React.JSX.Element;
declare function OrganizationProfileLink({ children }: PropsWithChildren<OrganizationProfileLinkProps>): React.JSX.Element;
declare const _OrganizationProfile: {
    (props: Without<WithClerkProp<PropsWithChildren<Without<OrganizationProfileProps, "customPages">> & FallbackProp>, "clerk">): React.JSX.Element | null;
    displayName: string;
};
declare const OrganizationProfile: OrganizationProfileExportType;
declare const CreateOrganization: {
    (props: Without<WithClerkProp<CreateOrganizationProps & FallbackProp>, "clerk">): React.JSX.Element | null;
    displayName: string;
};
declare const _OrganizationSwitcher: {
    (props: Without<WithClerkProp<PropsWithChildren<OrganizationSwitcherPropsWithoutCustomPages> & FallbackProp>, "clerk">): React.JSX.Element | null;
    displayName: string;
};
declare function OrganizationSwitcherOutlet(outletProps: Without<OrganizationSwitcherProps, 'organizationProfileProps'>): React.JSX.Element;
declare const OrganizationSwitcher: OrganizationSwitcherExportType;
declare const OrganizationList: {
    (props: Without<WithClerkProp<OrganizationListProps & FallbackProp>, "clerk">): React.JSX.Element | null;
    displayName: string;
};
declare const GoogleOneTap: {
    (props: Without<WithClerkProp<_clerk_shared_types.SignInForceRedirectUrl & _clerk_shared_types.SignUpForceRedirectUrl & {
        cancelOnTapOutside?: boolean;
        itpSupport?: boolean;
        fedCmSupport?: boolean;
        appearance?: _clerk_shared_types.SignInTheme;
    } & FallbackProp>, "clerk">): React.JSX.Element | null;
    displayName: string;
};
declare const Waitlist: {
    (props: Without<WithClerkProp<WaitlistProps & FallbackProp>, "clerk">): React.JSX.Element | null;
    displayName: string;
};
declare const PricingTable: {
    (props: Without<WithClerkProp<{
        for?: _clerk_shared_types.ForPayerType;
        appearance?: _clerk_shared_types.PricingTableTheme;
        checkoutProps?: Pick<_clerk_shared_types.__internal_CheckoutProps, "appearance">;
    } & {
        ctaPosition?: "top" | "bottom";
        collapseFeatures?: boolean;
        newSubscriptionRedirectUrl?: string;
    } & FallbackProp>, "clerk">): React.JSX.Element | null;
    displayName: string;
};
/**
 * @experimental This component is in early access and may change in future releases.
 */
declare const APIKeys: {
    (props: Without<WithClerkProp<APIKeysProps & FallbackProp>, "clerk">): React.JSX.Element | null;
    displayName: string;
};
declare const UserAvatar: {
    (props: Without<WithClerkProp<UserAvatarProps & FallbackProp>, "clerk">): React.JSX.Element | null;
    displayName: string;
};
declare const TaskChooseOrganization: {
    (props: Without<WithClerkProp<TaskChooseOrganizationProps & FallbackProp>, "clerk">): React.JSX.Element | null;
    displayName: string;
};
declare const TaskResetPassword: {
    (props: Without<WithClerkProp<TaskResetPasswordProps & FallbackProp>, "clerk">): React.JSX.Element | null;
    displayName: string;
};

declare const SignInButton: {
    (props: _clerk_shared_types.Without<WithClerkProp<React.PropsWithChildren<SignInButtonProps>>, "clerk">): React.JSX.Element | null;
    displayName: string;
};

declare const SignInWithMetamaskButton: {
    (props: _clerk_shared_types.Without<WithClerkProp<SignInWithMetamaskButtonProps>, "clerk">): React.JSX.Element | null;
    displayName: string;
};

type SignOutButtonProps = {
    redirectUrl?: string;
    signOutOptions?: SignOutOptions;
    children?: React.ReactNode;
};
declare const SignOutButton: {
    (props: _clerk_shared_types.Without<React.PropsWithChildren<WithClerkProp<SignOutButtonProps>>, "clerk">): React.JSX.Element | null;
    displayName: string;
};

declare const SignUpButton: {
    (props: _clerk_shared_types.Without<WithClerkProp<React.PropsWithChildren<SignUpButtonProps>>, "clerk">): React.JSX.Element | null;
    displayName: string;
};

declare const ClerkProvider: React.ComponentType<ClerkProviderProps>;

type UseEmailLinkSignInReturn = CreateEmailLinkFlowReturn<SignInStartEmailLinkFlowParams, SignInResource>;
type UseEmailLinkSignUpReturn = CreateEmailLinkFlowReturn<StartEmailLinkFlowParams, SignUpResource>;
type UseEmailLinkEmailAddressReturn = CreateEmailLinkFlowReturn<StartEmailLinkFlowParams, EmailAddressResource>;
declare function useEmailLink(resource: SignInResource): UseEmailLinkSignInReturn;
declare function useEmailLink(resource: SignUpResource): UseEmailLinkSignUpReturn;
declare function useEmailLink(resource: EmailAddressResource): UseEmailLinkEmailAddressReturn;

/**
 * The `useSignIn()` hook provides access to the [`SignIn`](https://clerk.com/docs/reference/javascript/sign-in) object, which allows you to check the current state of a sign-in attempt and manage the sign-in flow. You can use this to create a [custom sign-in flow](https://clerk.com/docs/guides/development/custom-flows/overview#sign-in-flow).
 *
 * @unionReturnHeadings
 * ["Initialization", "Loaded"]
 *
 * @example
 * ### Check the current state of a sign-in
 *
 * The following example uses the `useSignIn()` hook to access the [`SignIn`](https://clerk.com/docs/reference/javascript/sign-in) object, which contains the current sign-in attempt status and methods to create a new sign-in attempt. The `isLoaded` property is used to handle the loading state.
 *
 * <Tabs items='React,Next.js'>
 * <Tab>
 *
 * ```tsx {{ filename: 'src/pages/SignInPage.tsx' }}
 * import { useSignIn } from '@clerk/clerk-react'
 *
 * export default function SignInPage() {
 *   const { isLoaded, signIn } = useSignIn()
 *
 *   if (!isLoaded) {
 *     // Handle loading state
 *     return null
 *   }
 *
 *   return <div>The current sign-in attempt status is {signIn?.status}.</div>
 * }
 * ```
 *
 * </Tab>
 * <Tab>
 *
 * {@include ../../docs/use-sign-in.md#nextjs-01}
 *
 * </Tab>
 * </Tabs>
 *
 * @example
 * ### Create a custom sign-in flow with `useSignIn()`
 *
 * The `useSignIn()` hook can also be used to build fully custom sign-in flows, if Clerk's prebuilt components don't meet your specific needs or if you require more control over the authentication flow. Different sign-in flows include email and password, email and phone codes, email links, and multifactor (MFA). To learn more about using the `useSignIn()` hook to create custom flows, see the [custom flow guides](https://clerk.com/docs/guides/development/custom-flows/overview).
 *
 * ```empty```
 */
declare const useSignIn: () => UseSignInReturn;

/**
 * The `useSignUp()` hook provides access to the [`SignUp`](https://clerk.com/docs/reference/javascript/sign-up) object, which allows you to check the current state of a sign-up attempt and manage the sign-up flow. You can use this to create a [custom sign-up flow](https://clerk.com/docs/guides/development/custom-flows/overview#sign-up-flow).
 *
 * @unionReturnHeadings
 * ["Initialization", "Loaded"]
 *
 * @example
 * ### Check the current state of a sign-up
 *
 * The following example uses the `useSignUp()` hook to access the [`SignUp`](https://clerk.com/docs/reference/javascript/sign-up) object, which contains the current sign-up attempt status and methods to create a new sign-up attempt. The `isLoaded` property is used to handle the loading state.
 *
 * <Tabs items='React,Next.js'>
 * <Tab>
 *
 * ```tsx {{ filename: 'src/pages/SignUpPage.tsx' }}
 * import { useSignUp } from '@clerk/clerk-react'
 *
 * export default function SignUpPage() {
 *   const { isLoaded, signUp } = useSignUp()
 *
 *   if (!isLoaded) {
 *     // Handle loading state
 *     return null
 *   }
 *
 *   return <div>The current sign-up attempt status is {signUp?.status}.</div>
 * }
 * ```
 *
 * </Tab>
 * <Tab>
 *
 * {@include ../../docs/use-sign-up.md#nextjs-01}
 *
 * </Tab>
 * </Tabs>
 *
 * @example
 * ### Create a custom sign-up flow with `useSignUp()`
 *
 * The `useSignUp()` hook can also be used to build fully custom sign-up flows, if Clerk's prebuilt components don't meet your specific needs or if you require more control over the authentication flow. Different sign-up flows include email and password, email and phone codes, email links, and multifactor (MFA). To learn more about using the `useSignUp()` hook to create custom flows, see the [custom flow guides](https://clerk.com/docs/guides/development/custom-flows/overview).
 *
 * ```empty```
 */
declare const useSignUp: () => UseSignUpReturn;

export { APIKeys, ClerkProvider, ClerkProviderProps, CreateOrganization, GoogleOneTap, OrganizationList, OrganizationProfile, OrganizationSwitcher, PricingTable, SignIn, SignInButton, SignInWithMetamaskButton, SignOutButton, SignUp, SignUpButton, TaskChooseOrganization, TaskResetPassword, UserAvatar, UserButton, UserProfile, Waitlist, useEmailLink, useSignIn, useSignUp };
