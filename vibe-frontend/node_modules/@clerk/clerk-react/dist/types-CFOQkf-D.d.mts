import { Clerk, Without, ClerkOptions, ClientResource, DomainOrProxyUrl, MultiDomainAndOrProxy, InitialState, LoadedClerk, RedirectUrlProp } from '@clerk/shared/types';
import React from 'react';

declare global {
    interface Window {
        __clerk_publishable_key?: string;
        __clerk_proxy_url?: Clerk['proxyUrl'];
        __clerk_domain?: Clerk['domain'];
    }
}
type IsomorphicClerkOptions = Without<ClerkOptions, 'isSatellite'> & {
    Clerk?: ClerkProp;
    /**
     * The URL that `@clerk/clerk-js` should be hot-loaded from.
     */
    clerkJSUrl?: string;
    /**
     * If your web application only uses [Control Components](https://clerk.com/docs/reference/components/overview#control-components), you can set this value to `'headless'` and load a minimal ClerkJS bundle for optimal page performance.
     */
    clerkJSVariant?: 'headless' | '';
    /**
     * The npm version for `@clerk/clerk-js`.
     */
    clerkJSVersion?: string;
    /**
     * The Clerk Publishable Key for your instance. This can be found on the [API keys](https://dashboard.clerk.com/last-active?path=api-keys) page in the Clerk Dashboard.
     */
    publishableKey: string;
    /**
     * This nonce value will be passed through to the `@clerk/clerk-js` script tag. Use it to implement a [strict-dynamic CSP](https://clerk.com/docs/guides/secure/best-practices/csp-headers#implementing-a-strict-dynamic-csp). Requires the `dynamic` prop to also be set.
     */
    nonce?: string;
} & MultiDomainAndOrProxy;
/**
 * @interface
 */
type ClerkProviderProps = IsomorphicClerkOptions & {
    children: React.ReactNode;
    /**
     * Provide an initial state of the Clerk client during server-side rendering. You don't need to set this value yourself unless you're [developing an SDK](https://clerk.com/docs/guides/development/sdk-development/overview).
     */
    initialState?: InitialState;
    /**
     * Indicates to silently fail the initialization process when the publishable keys is not provided, instead of throwing an error.
     * @default false
     * @internal
     */
    __internal_bypassMissingPublishableKey?: boolean;
};
interface BrowserClerkConstructor {
    new (publishableKey: string, options?: DomainOrProxyUrl): BrowserClerk;
}
interface HeadlessBrowserClerkConstructor {
    new (publishableKey: string, options?: DomainOrProxyUrl): HeadlessBrowserClerk;
}
type WithClerkProp<T = unknown> = T & {
    clerk: LoadedClerk;
    component?: string;
};
interface HeadlessBrowserClerk extends Clerk {
    load: (opts?: Without<ClerkOptions, 'isSatellite'>) => Promise<void>;
    updateClient: (client: ClientResource) => void;
}
interface BrowserClerk extends HeadlessBrowserClerk {
    onComponentsReady: Promise<void>;
    components: any;
}
type ClerkProp = BrowserClerkConstructor | BrowserClerk | HeadlessBrowserClerk | HeadlessBrowserClerkConstructor | undefined | null;
type SignInWithMetamaskButtonProps = {
    mode?: 'redirect' | 'modal';
    children?: React.ReactNode;
} & RedirectUrlProp;
type PageProps<T extends string> = {
    label: string;
    url: string;
    labelIcon: React.ReactNode;
} | {
    label: T;
    url?: never;
    labelIcon?: never;
};
type UserProfilePageProps = PageProps<'account' | 'security' | 'billing' | 'apiKeys'>;
type UserProfileLinkProps = {
    url: string;
    label: string;
    labelIcon: React.ReactNode;
};
type OrganizationProfilePageProps = PageProps<'general' | 'members' | 'billing' | 'apiKeys'>;
type OrganizationProfileLinkProps = UserProfileLinkProps;
type ButtonActionProps<T extends string> = {
    label: string;
    labelIcon: React.ReactNode;
    onClick: () => void;
    open?: never;
} | {
    label: T;
    labelIcon?: never;
    onClick?: never;
    open?: never;
} | {
    label: string;
    labelIcon: React.ReactNode;
    onClick?: never;
    open: string;
};
type UserButtonActionProps = ButtonActionProps<'manageAccount' | 'signOut'>;
type UserButtonLinkProps = {
    href: string;
    label: string;
    labelIcon: React.ReactNode;
};

export type { BrowserClerk as B, ClerkProviderProps as C, HeadlessBrowserClerk as H, OrganizationProfilePageProps as O, SignInWithMetamaskButtonProps as S, UserProfilePageProps as U, WithClerkProp as W, OrganizationProfileLinkProps as a, UserProfileLinkProps as b, UserButtonActionProps as c, UserButtonLinkProps as d, ClerkProp as e };
