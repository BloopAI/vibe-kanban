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
export declare const DOCUMENT: Document;
export declare const NAVIGATOR: {
    userAgent?: string | undefined;
    maxTouchPoints?: number | undefined;
} & Navigator;
export declare const TRIGGER_LABEL = "Report a Bug";
export declare const CANCEL_BUTTON_LABEL = "Cancel";
export declare const SUBMIT_BUTTON_LABEL = "Send Bug Report";
export declare const CONFIRM_BUTTON_LABEL = "Confirm";
export declare const FORM_TITLE = "Report a Bug";
export declare const EMAIL_PLACEHOLDER = "your.email@example.org";
export declare const EMAIL_LABEL = "Email";
export declare const MESSAGE_PLACEHOLDER = "What's the bug? What did you expect?";
export declare const MESSAGE_LABEL = "Description";
export declare const NAME_PLACEHOLDER = "Your Name";
export declare const NAME_LABEL = "Name";
export declare const SUCCESS_MESSAGE_TEXT = "Thank you for your report!";
export declare const IS_REQUIRED_LABEL = "(required)";
export declare const ADD_SCREENSHOT_LABEL = "Add a screenshot";
export declare const REMOVE_SCREENSHOT_LABEL = "Remove screenshot";
export declare const FEEDBACK_WIDGET_SOURCE = "widget";
export declare const FEEDBACK_API_SOURCE = "api";
export declare const SUCCESS_MESSAGE_TIMEOUT = 5000;
//# sourceMappingURL=index.d.ts.map
