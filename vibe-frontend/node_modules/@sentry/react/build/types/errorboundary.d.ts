import type { ReportDialogOptions } from '@sentry/browser';
import type { Scope } from '@sentry/core';
import * as React from 'react';
export declare const UNKNOWN_COMPONENT = "unknown";
export type FallbackRender = (errorData: {
    error: unknown;
    componentStack: string;
    eventId: string;
    resetError(): void;
}) => React.ReactElement;
type OnUnmountType = {
    (error: null, componentStack: null, eventId: null): void;
    (error: unknown, componentStack: string, eventId: string): void;
};
export type ErrorBoundaryProps = {
    children?: React.ReactNode | (() => React.ReactNode);
    /** If a Sentry report dialog should be rendered on error */
    showDialog?: boolean | undefined;
    /**
     * Options to be passed into the Sentry report dialog.
     * No-op if {@link showDialog} is false.
     */
    dialogOptions?: ReportDialogOptions | undefined;
    /**
     * A fallback component that gets rendered when the error boundary encounters an error.
     *
     * Can either provide a React Component, or a function that returns React Component as
     * a valid fallback prop. If a function is provided, the function will be called with
     * the error, the component stack, and an function that resets the error boundary on error.
     *
     */
    fallback?: React.ReactElement | FallbackRender | undefined;
    /**
     * If set to `true` or `false`, the error `handled` property will be set to the given value.
     * If unset, the default behaviour is to rely on the presence of the `fallback` prop to determine
     * if the error was handled or not.
     */
    handled?: boolean | undefined;
    /** Called when the error boundary encounters an error */
    onError?: ((error: unknown, componentStack: string, eventId: string) => void) | undefined;
    /** Called on componentDidMount() */
    onMount?: (() => void) | undefined;
    /**
     * Called when the error boundary resets due to a reset call from the
     * fallback render props function.
     */
    onReset?: ((error: unknown, componentStack: string, eventId: string) => void) | undefined;
    /**
     * Called on componentWillUnmount() with the error, componentStack, and eventId.
     *
     * If the error boundary never encountered an error, the error
     * componentStack, and eventId will be null.
     */
    onUnmount?: OnUnmountType | undefined;
    /** Called before the error is captured by Sentry, allows for you to add tags or context using the scope */
    beforeCapture?: ((scope: Scope, error: unknown, componentStack: string) => void) | undefined;
};
type ErrorBoundaryState = {
    componentStack: null;
    error: null;
    eventId: null;
} | {
    componentStack: React.ErrorInfo['componentStack'];
    error: unknown;
    eventId: string;
};
/**
 * A ErrorBoundary component that logs errors to Sentry.
 * NOTE: If you are a Sentry user, and you are seeing this stack frame, it means the
 * Sentry React SDK ErrorBoundary caught an error invoking your application code. This
 * is expected behavior and NOT indicative of a bug with the Sentry React SDK.
 */
declare class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState;
    private readonly _openFallbackReportDialog;
    private _lastEventId?;
    private _cleanupHook?;
    constructor(props: ErrorBoundaryProps);
    componentDidCatch(error: unknown, errorInfo: React.ErrorInfo): void;
    componentDidMount(): void;
    componentWillUnmount(): void;
    resetErrorBoundary(): void;
    render(): React.ReactNode;
}
declare function withErrorBoundary<P extends Record<string, any>>(WrappedComponent: React.ComponentType<P>, errorBoundaryOptions: ErrorBoundaryProps): React.FC<P>;
export { ErrorBoundary, withErrorBoundary };
//# sourceMappingURL=errorboundary.d.ts.map