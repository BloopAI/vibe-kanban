import type { FetchBreadcrumbHint, HandlerDataFetch, SentryWrappedXMLHttpRequest, XhrBreadcrumbHint } from '@sentry/core';
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
} & import("@sentry/core").Carrier & Omit<Window, "document"> & Partial<Pick<Window, "document">>;
export type NetworkMetaWarning = 'MAYBE_JSON_TRUNCATED' | 'TEXT_TRUNCATED' | 'URL_SKIPPED' | 'BODY_PARSE_ERROR' | 'BODY_PARSE_TIMEOUT' | 'UNPARSEABLE_BODY_TYPE';
type RequestBody = null | Blob | BufferSource | FormData | URLSearchParams | string;
export type XhrHint = XhrBreadcrumbHint & {
    xhr: XMLHttpRequest & SentryWrappedXMLHttpRequest;
    input?: RequestBody;
};
export type FetchHint = FetchBreadcrumbHint & {
    input: HandlerDataFetch['args'];
    response: Response;
};
export {};
//# sourceMappingURL=types.d.ts.map