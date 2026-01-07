import { AnyFunction } from "@tanstack/pacer/types";

//#region src/lite-throttler.d.ts

/**
 * Options for configuring a lite throttled function
 */
interface LiteThrottlerOptions<TFn extends AnyFunction = AnyFunction> {
  /**
   * Whether to execute on the leading edge of the timeout.
   * Defaults to true.
   */
  leading?: boolean;
  /**
   * Callback function that is called after the function is executed
   */
  onExecute?: (args: Parameters<TFn>, throttler: LiteThrottler<TFn>) => void;
  /**
   * Whether to execute on the trailing edge of the timeout.
   * Defaults to true.
   */
  trailing?: boolean;
  /**
   * Time window in milliseconds during which the function can only be executed once.
   */
  wait: number;
}
/**
 * A lightweight class that creates a throttled function.
 *
 * This is an alternative to the Throttler in the core @tanstack/pacer package, but is more
 * suitable for libraries and npm packages that need minimal overhead. Unlike the core Throttler,
 * this version does not use TanStack Store for state management, has no devtools integration,
 * and provides only essential throttling functionality.
 *
 * Throttling ensures a function is called at most once within a specified time window.
 * Unlike debouncing which waits for a pause in calls, throttling guarantees consistent
 * execution timing regardless of call frequency.
 *
 * Supports both leading and trailing edge execution:
 * - Leading: Execute immediately on first call (default: true)
 * - Trailing: Execute after wait period if called during throttle (default: true)
 *
 * Features:
 * - Zero dependencies - no external libraries required
 * - Minimal API surface - only essential methods (maybeExecute, flush, cancel)
 * - Simple state management - uses basic private properties instead of reactive stores
 * - Callback support for monitoring execution events
 * - Lightweight - designed for use in npm packages where bundle size matters
 *
 * @example
 * ```ts
 * const throttler = new LiteThrottler((scrollY: number) => {
 *   updateScrollPosition(scrollY);
 * }, {
 *   wait: 100,
 *   onExecute: (args, throttler) => {
 *     console.log('Updated scroll position:', args[0]);
 *   }
 * });
 *
 * // Will execute at most once per 100ms
 * window.addEventListener('scroll', () => {
 *   throttler.maybeExecute(window.scrollY);
 * });
 * ```
 */
declare class LiteThrottler<TFn extends AnyFunction> {
  fn: TFn;
  options: LiteThrottlerOptions<TFn>;
  private timeoutId;
  private lastArgs;
  private lastExecutionTime;
  private isPending;
  constructor(fn: TFn, options: LiteThrottlerOptions<TFn>);
  /**
   * Attempts to execute the throttled function. The execution behavior depends on the throttler options:
   *
   * - If enough time has passed since the last execution (>= wait period):
   *   - With leading=true: Executes immediately
   *   - With leading=false: Waits for the next trailing execution
   *
   * - If within the wait period:
   *   - With trailing=true: Schedules execution for end of wait period
   *   - With trailing=false: Drops the execution
   */
  maybeExecute: (...args: Parameters<TFn>) => void;
  private execute;
  /**
   * Processes the current pending execution immediately.
   * If there's a pending execution, it will be executed right away
   * and the timeout will be cleared.
   */
  flush: () => void;
  /**
   * Cancels any pending trailing execution and clears internal state.
   * If a trailing execution is scheduled, this will prevent that execution from occurring.
   */
  cancel: () => void;
  private clearTimeout;
}
/**
 * Creates a lightweight throttled function that limits how often the provided function can execute.
 *
 * This is an alternative to the throttle function in the core @tanstack/pacer package, but is more
 * suitable for libraries and npm packages that need minimal overhead. Unlike the core version,
 * this function creates a throttler with no external dependencies, devtools integration, or reactive state.
 *
 * Throttling ensures a function executes at most once within a specified time window,
 * regardless of how many times it is called. This is useful for rate-limiting
 * expensive operations or UI updates.
 *
 * @example
 * ```ts
 * const throttledScroll = liteThrottle(() => {
 *   updateScrollIndicator();
 * }, { wait: 100 });
 *
 * // Will execute at most once per 100ms
 * window.addEventListener('scroll', throttledScroll);
 * ```
 *
 * @example
 * ```ts
 * // Leading edge execution - fires immediately then throttles
 * const throttledResize = liteThrottle(() => {
 *   recalculateLayout();
 * }, { wait: 250, leading: true, trailing: false });
 * ```
 */
declare function liteThrottle<TFn extends AnyFunction>(fn: TFn, options: LiteThrottlerOptions<TFn>): (...args: Parameters<TFn>) => void;
//#endregion
export { LiteThrottler, LiteThrottlerOptions, liteThrottle };
//# sourceMappingURL=lite-throttler.d.ts.map