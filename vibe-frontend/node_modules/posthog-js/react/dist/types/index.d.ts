import * as React from 'react';
import React__default, { JSX, FunctionComponent, ErrorInfo } from 'react';
import * as posthogJs from 'posthog-js';
import posthogJs__default, { BootstrapConfig, PostHogConfig, JsonType, CaptureResult } from 'posthog-js';

type PostHog = typeof posthogJs__default;
declare const PostHogContext: React.Context<{
    client: PostHog;
    bootstrap?: BootstrapConfig;
}>;

type WithOptionalChildren<T> = T & {
    children?: React__default.ReactNode | undefined;
};
type PostHogProviderProps = {
    client: PostHog;
    apiKey?: never;
    options?: never;
} | {
    apiKey: string;
    options?: Partial<PostHogConfig>;
    client?: never;
};
declare function PostHogProvider({ children, client, apiKey, options }: WithOptionalChildren<PostHogProviderProps>): React__default.JSX.Element;

declare function useFeatureFlagEnabled(flag: string): boolean | undefined;

declare function useFeatureFlagPayload(flag: string): JsonType;

declare function useActiveFeatureFlags(): string[];

declare function useFeatureFlagVariantKey(flag: string): string | boolean | undefined;

declare const usePostHog: () => PostHog;

type PostHogFeatureProps = Omit<React__default.HTMLProps<HTMLDivElement>, 'children'> & {
    flag: string;
    children: React__default.ReactNode | ((payload: any) => React__default.ReactNode);
    fallback?: React__default.ReactNode;
    match?: string | boolean;
    visibilityObserverOptions?: IntersectionObserverInit;
    trackInteraction?: boolean;
    trackView?: boolean;
};
declare function PostHogFeature({ flag, match, children, fallback, visibilityObserverOptions, trackInteraction, trackView, ...props }: PostHogFeatureProps): JSX.Element | null;
declare function captureFeatureInteraction({ flag, posthog, flagVariant, }: {
    flag: string;
    posthog: PostHog;
    flagVariant?: string | boolean;
}): void;
declare function captureFeatureView({ flag, posthog, flagVariant, }: {
    flag: string;
    posthog: PostHog;
    flagVariant?: string | boolean;
}): void;

type PostHogCaptureOnViewedProps = React__default.HTMLProps<HTMLDivElement> & {
    name?: string;
    properties?: Record<string, any>;
    observerOptions?: IntersectionObserverInit;
    trackAllChildren?: boolean;
};
declare function PostHogCaptureOnViewed({ name, properties, observerOptions, trackAllChildren, children, ...props }: PostHogCaptureOnViewedProps): JSX.Element;

type Properties = Record<string, any>;
type PostHogErrorBoundaryFallbackProps = {
    error: unknown;
    exceptionEvent: unknown;
    componentStack: string;
};
type PostHogErrorBoundaryProps = {
    children?: React__default.ReactNode | (() => React__default.ReactNode);
    fallback?: React__default.ReactNode | FunctionComponent<PostHogErrorBoundaryFallbackProps>;
    additionalProperties?: Properties | ((error: unknown) => Properties);
};
type PostHogErrorBoundaryState = {
    componentStack: string | null;
    exceptionEvent: unknown;
    error: unknown;
};
declare class PostHogErrorBoundary extends React__default.Component<PostHogErrorBoundaryProps, PostHogErrorBoundaryState> {
    static contextType: React__default.Context<{
        client: PostHog;
        bootstrap?: posthogJs.BootstrapConfig;
    }>;
    context: React__default.ContextType<typeof PostHogContext>;
    constructor(props: PostHogErrorBoundaryProps);
    componentDidCatch(error: unknown, errorInfo: React__default.ErrorInfo): void;
    render(): React__default.ReactNode;
}

declare const setupReactErrorHandler: (client: PostHog, callback?: (event: CaptureResult | undefined, error: any, errorInfo: ErrorInfo) => void) => (error: any, errorInfo: ErrorInfo) => void;

export { type PostHog, PostHogCaptureOnViewed, type PostHogCaptureOnViewedProps, PostHogContext, PostHogErrorBoundary, type PostHogErrorBoundaryFallbackProps, type PostHogErrorBoundaryProps, PostHogFeature, type PostHogFeatureProps, PostHogProvider, captureFeatureInteraction, captureFeatureView, setupReactErrorHandler, useActiveFeatureFlags, useFeatureFlagEnabled, useFeatureFlagPayload, useFeatureFlagVariantKey, usePostHog };
