import type { ConsoleLevel } from '../types-hoist/instrument';
/**
 * A Sentry Logger instance.
 *
 * @deprecated Use {@link debug} instead with the {@link SentryDebugLogger} type.
 */
export interface Logger {
    disable(): void;
    enable(): void;
    isEnabled(): boolean;
    log(...args: Parameters<typeof console.log>): void;
    info(...args: Parameters<typeof console.info>): void;
    warn(...args: Parameters<typeof console.warn>): void;
    error(...args: Parameters<typeof console.error>): void;
    debug(...args: Parameters<typeof console.debug>): void;
    assert(...args: Parameters<typeof console.assert>): void;
    trace(...args: Parameters<typeof console.trace>): void;
}
export interface SentryDebugLogger {
    disable(): void;
    enable(): void;
    isEnabled(): boolean;
    log(...args: Parameters<typeof console.log>): void;
    warn(...args: Parameters<typeof console.warn>): void;
    error(...args: Parameters<typeof console.error>): void;
}
export declare const CONSOLE_LEVELS: readonly ConsoleLevel[];
/** This may be mutated by the console instrumentation. */
export declare const originalConsoleMethods: Partial<{
    log(...args: Parameters<typeof console.log>): void;
    info(...args: Parameters<typeof console.info>): void;
    warn(...args: Parameters<typeof console.warn>): void;
    error(...args: Parameters<typeof console.error>): void;
    debug(...args: Parameters<typeof console.debug>): void;
    assert(...args: Parameters<typeof console.assert>): void;
    trace(...args: Parameters<typeof console.trace>): void;
}>;
/**
 * Temporarily disable sentry console instrumentations.
 *
 * @param callback The function to run against the original `console` messages
 * @returns The results of the callback
 */
export declare function consoleSandbox<T>(callback: () => T): T;
declare function enable(): void;
declare function disable(): void;
declare function isEnabled(): boolean;
declare function log(...args: Parameters<typeof console.log>): void;
declare function info(...args: Parameters<typeof console.info>): void;
declare function warn(...args: Parameters<typeof console.warn>): void;
declare function error(...args: Parameters<typeof console.error>): void;
declare function _debug(...args: Parameters<typeof console.debug>): void;
declare function assert(...args: Parameters<typeof console.assert>): void;
declare function trace(...args: Parameters<typeof console.trace>): void;
/**
 * This is a logger singleton which either logs things or no-ops if logging is not enabled.
 * The logger is a singleton on the carrier, to ensure that a consistent logger is used throughout the SDK.
 *
 * @deprecated Use {@link debug} instead.
 */
export declare const logger: {
    /** Enable logging. */
    enable: typeof enable;
    /** Disable logging. */
    disable: typeof disable;
    /** Check if logging is enabled. */
    isEnabled: typeof isEnabled;
    /** Log a message. */
    log: typeof log;
    /** Log level info */
    info: typeof info;
    /** Log a warning. */
    warn: typeof warn;
    /** Log an error. */
    error: typeof error;
    /** Log a debug message. */
    debug: typeof _debug;
    /** Log an assertion. */
    assert: typeof assert;
    /** Log a trace. */
    trace: typeof trace;
};
/**
 * This is a logger singleton which either logs things or no-ops if logging is not enabled.
 */
export declare const debug: {
    /** Enable logging. */
    enable: typeof enable;
    /** Disable logging. */
    disable: typeof disable;
    /** Check if logging is enabled. */
    isEnabled: typeof isEnabled;
    /** Log a message. */
    log: typeof log;
    /** Log a warning. */
    warn: typeof warn;
    /** Log an error. */
    error: typeof error;
};
export {};
//# sourceMappingURL=debug-logger.d.ts.map