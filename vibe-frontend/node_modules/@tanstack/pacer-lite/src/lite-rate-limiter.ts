import type { AnyFunction } from '@tanstack/pacer/types'

/**
 * Options for configuring a lite rate-limited function
 */
export interface LiteRateLimiterOptions<TFn extends AnyFunction = AnyFunction> {
  /**
   * Maximum number of executions allowed within the time window.
   */
  limit: number
  /**
   * Callback function that is called after the function is executed
   */
  onExecute?: (args: Parameters<TFn>, rateLimiter: LiteRateLimiter<TFn>) => void
  /**
   * Optional callback function that is called when an execution is rejected due to rate limiting
   */
  onReject?: (rateLimiter: LiteRateLimiter<TFn>) => void
  /**
   * Time window in milliseconds within which the limit applies.
   */
  window: number
  /**
   * Type of window to use for rate limiting
   * - 'fixed': Uses a fixed window that resets after the window period
   * - 'sliding': Uses a sliding window that allows executions as old ones expire
   * Defaults to 'fixed'
   */
  windowType?: 'fixed' | 'sliding'
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
export class LiteRateLimiter<TFn extends AnyFunction> {
  private executionTimes: Array<number> = []
  private timeoutIds: Set<NodeJS.Timeout> = new Set()

  constructor(
    public fn: TFn,
    public options: LiteRateLimiterOptions<TFn>,
  ) {
    // Default windowType to 'fixed' if not specified
    if (this.options.windowType === undefined) {
      this.options.windowType = 'fixed'
    }
  }

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
  maybeExecute = (...args: Parameters<TFn>): boolean => {
    this.cleanupOldExecutions()

    const relevantExecutionTimes = this.getExecutionTimesInWindow()

    if (relevantExecutionTimes.length < this.options.limit) {
      this.execute(...args)
      return true
    }

    this.options.onReject?.(this)
    return false
  }

  private execute = (...args: Parameters<TFn>): void => {
    const now = Date.now()
    this.fn(...args)
    this.options.onExecute?.(args, this)
    this.executionTimes.push(now)
    this.setCleanupTimeout(now)
  }

  private getExecutionTimesInWindow = (): Array<number> => {
    if (this.options.windowType === 'sliding') {
      // For sliding window, return all executions within the current window
      return this.executionTimes.filter(
        (time) => time > Date.now() - this.options.window,
      )
    } else {
      // For fixed window, return all executions in the current window
      if (this.executionTimes.length === 0) {
        return []
      }
      const oldestExecution = Math.min(...this.executionTimes)
      const windowStart = oldestExecution
      const windowEnd = windowStart + this.options.window
      const now = Date.now()

      // If the window has expired, return empty array
      if (now > windowEnd) {
        return []
      }

      // Otherwise, return all executions in the current window
      return this.executionTimes.filter(
        (time) => time >= windowStart && time <= windowEnd,
      )
    }
  }

  private setCleanupTimeout = (executionTime: number): void => {
    if (
      this.options.windowType === 'sliding' ||
      this.timeoutIds.size === 0 // new fixed window
    ) {
      const now = Date.now()
      const timeUntilExpiration = executionTime - now + this.options.window + 1
      const timeoutId = setTimeout(() => {
        this.cleanupOldExecutions()
        this.clearTimeout(timeoutId)
      }, timeUntilExpiration)
      this.timeoutIds.add(timeoutId)
    }
  }

  private clearTimeout = (timeoutId: NodeJS.Timeout): void => {
    clearTimeout(timeoutId)
    this.timeoutIds.delete(timeoutId)
  }

  private clearTimeouts = (): void => {
    this.timeoutIds.forEach((timeoutId) => clearTimeout(timeoutId))
    this.timeoutIds.clear()
  }

  private cleanupOldExecutions = (): void => {
    this.executionTimes = this.getExecutionTimesInWindow()
  }

  /**
   * Returns the number of remaining executions allowed in the current window.
   */
  getRemainingInWindow = (): number => {
    const relevantExecutionTimes = this.getExecutionTimesInWindow()
    return Math.max(0, this.options.limit - relevantExecutionTimes.length)
  }

  /**
   * Returns the number of milliseconds until the next execution will be possible.
   * Returns 0 if executions are currently allowed.
   */
  getMsUntilNextWindow = (): number => {
    if (this.getRemainingInWindow() > 0) {
      return 0
    }
    const oldestExecution = this.executionTimes[0] ?? Infinity
    return oldestExecution + this.options.window - Date.now()
  }

  /**
   * Resets the rate limiter state, clearing all execution history.
   */
  reset = (): void => {
    this.executionTimes = []
    this.clearTimeouts()
  }
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
export function liteRateLimit<TFn extends AnyFunction>(
  fn: TFn,
  options: LiteRateLimiterOptions<TFn>,
): (...args: Parameters<TFn>) => boolean {
  const rateLimiter = new LiteRateLimiter(fn, options)
  return rateLimiter.maybeExecute
}
