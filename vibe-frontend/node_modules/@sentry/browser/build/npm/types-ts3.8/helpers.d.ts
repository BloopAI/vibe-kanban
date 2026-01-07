import { Mechanism, WrappedFunction } from '@sentry/core';
export declare const WINDOW: {
    navigator?: {
        userAgent?: string | undefined;
        maxTouchPoints?: number | undefined;
    } | undefined;
    console: Console;
    PerformanceObserver?: any;
    Sentry?: any;
    onerror?: {
        (event: string | object, source?: string | undefined, lineno?: number | undefined, colno?: number | undefined, error?: Error | undefined): any;
        __SENTRY_INSTRUMENTED__?: true | undefined;
    } | undefined;
    onunhandledrejection?: {
        (event: unknown): boolean;
        __SENTRY_INSTRUMENTED__?: true | undefined;
    } | undefined;
    SENTRY_ENVIRONMENT?: string | undefined;
    SENTRY_DSN?: string | undefined;
    SENTRY_RELEASE?: {
        id?: string | undefined;
    } | undefined;
    SENTRY_SDK_SOURCE?: import("@sentry/core").SdkSource | undefined;
    _sentryDebugIds?: Record<string, string> | undefined;
    _sentryModuleMetadata?: Record<string, any> | undefined;
    _sentryEsmLoaderHookRegistered?: boolean | undefined;
} & import("@sentry/core").Carrier & Window;
/**
 * @hidden
 */
export declare function shouldIgnoreOnError(): boolean;
/**
 * @hidden
 */
export declare function ignoreNextOnError(): void;
type WrappableFunction = Function;
export declare function wrap<T extends WrappableFunction>(fn: T, options?: {
    mechanism?: Mechanism;
}): WrappedFunction<T>;
export declare function wrap<NonFunction>(fn: NonFunction, options?: {
    mechanism?: Mechanism;
}): NonFunction;
/**
 * Get HTTP request data from the current page.
 */
export declare function getHttpRequestData(): {
    url: string;
    headers: Record<string, string>;
};
export {};
//# sourceMappingURL=helpers.d.ts.map
