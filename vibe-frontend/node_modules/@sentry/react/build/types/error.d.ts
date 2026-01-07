import { captureException } from '@sentry/browser';
import type { ErrorInfo } from 'react';
/**
 * See if React major version is 17+ by parsing version string.
 */
export declare function isAtLeastReact17(reactVersion: string): boolean;
/**
 * Recurse through `error.cause` chain to set cause on an error.
 */
export declare function setCause(error: Error & {
    cause?: Error;
}, cause: Error): void;
/**
 * Captures an error that was thrown by a React ErrorBoundary or React root.
 *
 * @param error The error to capture.
 * @param errorInfo The errorInfo provided by React.
 * @param hint Optional additional data to attach to the Sentry event.
 * @returns the id of the captured Sentry event.
 */
export declare function captureReactException(error: any, { componentStack }: ErrorInfo, hint?: Parameters<typeof captureException>[1]): string;
/**
 * Creates an error handler that can be used with the `onCaughtError`, `onUncaughtError`,
 * and `onRecoverableError` options in `createRoot` and `hydrateRoot` React DOM methods.
 *
 * @param callback An optional callback that will be called after the error is captured.
 * Use this to add custom handling for errors.
 *
 * @example
 *
 * ```JavaScript
 * const root = createRoot(container, {
 *  onCaughtError: Sentry.reactErrorHandler(),
 *  onUncaughtError: Sentry.reactErrorHandler((error, errorInfo) => {
 *    console.warn('Caught error', error, errorInfo.componentStack);
 *  });
 * });
 * ```
 */
export declare function reactErrorHandler(callback?: (error: any, errorInfo: ErrorInfo, eventId: string) => void): (error: any, errorInfo: ErrorInfo) => void;
//# sourceMappingURL=error.d.ts.map