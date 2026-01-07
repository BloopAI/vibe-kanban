import { AnyFunction } from "@tanstack/pacer/types";

//#region src/lite-rate-limiter.d.ts

/**
 * Options for configuring a lite rate-limited function
 */
interface LiteRateLimiterOptions<TFn extends AnyFunction = AnyFunction> {
  /**
   * Maximum number of executions allowed within the time window.
   */
  limit: number;
  /**
   * Callback function that is called after the function is executed
   */
  onExecute?: (args: Parameters<TFn>, rateLimiter: LiteRateLimiter<TFn>) => void;
  /**
   * Optional callback function that is called when an execution is rejected due to rate limiting
   */
  onReject?: (rateLimiter: LiteRateLimiter<TFn>) => void;
  /**
   * Time window in milliseconds within which the limit applies.
   */
  window: number;
  /**
   * Type of window to use for rate limiting
   * - 'fixed': Uses a fixed window that resets after the window period
   * - 'sliding': Uses a sliding window that allows executions as old ones expire
   * Defaults to 'fixed'
   */
  windowType?: 'fixed' | 'sliding';
}
/**
 * A lightweight class that creates a rate-limited function.
 *
 * This is an alternative to the RateLimiter in the core @tanstack/pacer package, but is more
 * suitable for libraries and npm packages that need minimal overhead. Unlike the core RateLimiter,
 * this version does not use TanStack Store for state management, has no devtools integration,
 * and provides only essential rate limiting functionality.
 *
 * Rate limiting allows a function to execute up to a limit within a time window,
 * then blocks all subsequent calls until the window passes. This can lead to "bursty" behavior where
 * all executions happen immediately, followed by a complete block.
 *
 * The rate limiter supports two types of windows:
 * - 'fixed': A strict window that resets after the window period. All executions within the window count
 *   towards the limit, and the window resets completely after the period.
 * - 'sliding': A rolling window that allows executions as old ones expire. This provides a more
 *   consistent rate of execution over time.
 *
 * Features:
 * - Zero dependencies - no external libraries required
 * - Minimal API surface - only essential methods (maybeExecute, getRemainingInWindow, getMsUntilNextWindow, reset)
 * - Simple state management - uses basic private properties instead of reactive stores
 * - Lightweight - designed for use in npm packages where bundle size matters
 *
 * @example
 * ```ts
 * const rateLimiter = new LiteRateLimiter((id: string) => {
 *   api.getData(id);
 * }, { limit: 5, window: 1000 });
 *
 * // First 5 calls will execute, then block until window resets
 * if (rateLimiter.maybeExecute('123')) {
 *   console.log('API call made');
 * } else {
 *   console.log('Rate limited - try again in', rateLimiter.getMsUntilNextWindow(), 'ms');
 * }
 * ```
 */
declare class LiteRateLimiter<TFn extends AnyFunction> {
  fn: TFn;
  options: LiteRateLimiterOptions<TFn>;
  private executionTimes;
  private timeoutIds;
  constructor(fn: TFn, options: LiteRateLimiterOptions<TFn>);
  /**
   * Attempts to execute the rate-limited function if within the configured limits.
   * Returns true if executed, false if rejected due to rate limiting.
   *
   * @example
   * ```ts
   * const rateLimiter = new LiteRateLimiter(fn, { limit: 5, window: 1000 });
   *
   * // First 5 calls return true
   * rateLimiter.maybeExecute('arg1', 'arg2'); // true
   *
   * // Additional calls within the window return false
   * rateLimiter.maybeExecute('arg1', 'arg2'); // false
   * ```
   */
  maybeExecute: (...args: Parameters<TFn>) => boolean;
  private execute;
  private getExecutionTimesInWindow;
  private setCleanupTimeout;
  private clearTimeout;
  private clearTimeouts;
  private cleanupOldExecutions;
  /**
   * Returns the number of remaining executions allowed in the current window.
   */
  getRemainingInWindow: () => number;
  /**
   * Returns the number of milliseconds until the next execution will be possible.
   * Returns 0 if executions are currently allowed.
   */
  getMsUntilNextWindow: () => number;
  /**
   * Resets the rate limiter state, clearing all execution history.
   */
  reset: () => void;
}
/**
 * Creates a lightweight rate-limited function that will execute the provided function up to a maximum number of times within a time window.
 *
 * This is an alternative to the rateLimit function in the core @tanstack/pacer package, but is more
 * suitable for libraries and npm packages that need minimal overhead. Unlike the core version,
 * this function creates a rate limiter with no external dependencies, devtools integration, or reactive state.
 *
 * Rate limiting allows all executions until the limit is reached, then blocks all subsequent calls until the window resets.
 * This differs from throttling (which ensures even spacing) and debouncing (which waits for pauses).
 *
 * @example
 * ```ts
 * const rateLimitedApi = liteRateLimit(makeApiCall, {
 *   limit: 5,
 *   window: 60000, // 1 minute
 *   windowType: 'sliding'
 * });
 *
 * // First 5 calls execute immediately
 * // Additional calls are rejected until window allows
 * rateLimitedApi();
 * ```
 *
 * @example
 * ```ts
 * // Fixed window - all 10 calls happen in first second, then 10 second wait
 * const rateLimitedFixed = liteRateLimit(logEvent, {
 *   limit: 10,
 *   window: 10000,
 *   windowType: 'fixed'
 * });
 * ```
 */
declare function liteRateLimit<TFn extends AnyFunction>(fn: TFn, options: LiteRateLimiterOptions<TFn>): (...args: Parameters<TFn>) => boolean;
//#endregion
export { LiteRateLimiter, LiteRateLimiterOptions, liteRateLimit };
//# sourceMappingURL=lite-rate-limiter.d.ts.map