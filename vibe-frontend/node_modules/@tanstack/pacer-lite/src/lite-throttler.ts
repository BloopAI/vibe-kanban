import type { AnyFunction } from '@tanstack/pacer/types'

/**
 * Options for configuring a lite throttled function
 */
export interface LiteThrottlerOptions<TFn extends AnyFunction = AnyFunction> {
  /**
   * Whether to execute on the leading edge of the timeout.
   * Defaults to true.
   */
  leading?: boolean
  /**
   * Callback function that is called after the function is executed
   */
  onExecute?: (args: Parameters<TFn>, throttler: LiteThrottler<TFn>) => void
  /**
   * Whether to execute on the trailing edge of the timeout.
   * Defaults to true.
   */
  trailing?: boolean
  /**
   * Time window in milliseconds during which the function can only be executed once.
   */
  wait: number
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
export class LiteThrottler<TFn extends AnyFunction> {
  private timeoutId: NodeJS.Timeout | undefined
  private lastArgs: Parameters<TFn> | undefined
  private lastExecutionTime = 0
  private isPending = false

  constructor(
    public fn: TFn,
    public options: LiteThrottlerOptions<TFn>,
  ) {
    // Default both leading and trailing to true if neither is specified
    if (
      this.options.leading === undefined &&
      this.options.trailing === undefined
    ) {
      this.options.leading = true
      this.options.trailing = true
    }
  }

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
  maybeExecute = (...args: Parameters<TFn>): void => {
    const now = Date.now()
    const timeSinceLastExecution = now - this.lastExecutionTime

    // Handle leading execution
    if (this.options.leading && timeSinceLastExecution >= this.options.wait) {
      this.execute(...args)
    } else {
      // Store the most recent arguments for potential trailing execution
      this.lastArgs = args

      // Set up trailing execution if not already scheduled
      if (!this.timeoutId && this.options.trailing) {
        const timeoutDuration = this.options.wait - timeSinceLastExecution
        this.isPending = true
        this.timeoutId = setTimeout(() => {
          if (this.lastArgs !== undefined) {
            this.execute(...this.lastArgs)
          }
        }, timeoutDuration)
      }
    }
  }

  private execute = (...args: Parameters<TFn>): void => {
    this.fn(...args)
    this.options.onExecute?.(args, this)
    this.lastExecutionTime = Date.now()
    this.clearTimeout()
    this.lastArgs = undefined
    this.isPending = false
  }

  /**
   * Processes the current pending execution immediately.
   * If there's a pending execution, it will be executed right away
   * and the timeout will be cleared.
   */
  flush = (): void => {
    if (this.isPending && this.lastArgs) {
      this.execute(...this.lastArgs)
    }
  }

  /**
   * Cancels any pending trailing execution and clears internal state.
   * If a trailing execution is scheduled, this will prevent that execution from occurring.
   */
  cancel = (): void => {
    this.clearTimeout()
    this.lastArgs = undefined
    this.isPending = false
  }

  private clearTimeout = (): void => {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
      this.timeoutId = undefined
    }
  }
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
export function liteThrottle<TFn extends AnyFunction>(
  fn: TFn,
  options: LiteThrottlerOptions<TFn>,
): (...args: Parameters<TFn>) => void {
  const throttler = new LiteThrottler(fn, options)
  return throttler.maybeExecute
}
