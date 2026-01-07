import type { AnyFunction } from '@tanstack/pacer/types'

/**
 * Options for configuring a lite debounced function
 */
export interface LiteDebouncerOptions<TFn extends AnyFunction = AnyFunction> {
  /**
   * Whether to execute on the leading edge of the timeout.
   * The first call will execute immediately and the rest will wait the delay.
   * Defaults to false.
   */
  leading?: boolean
  /**
   * Callback function that is called after the function is executed
   */
  onExecute?: (args: Parameters<TFn>, debouncer: LiteDebouncer<TFn>) => void
  /**
   * Whether to execute on the trailing edge of the timeout.
   * Defaults to true.
   */
  trailing?: boolean
  /**
   * Delay in milliseconds before executing the function.
   */
  wait: number
}

/**
 * A lightweight class that creates a debounced function.
 *
 * This is an alternative to the Debouncer in the core @tanstack/pacer package, but is more
 * suitable for libraries and npm packages that need minimal overhead. Unlike the core Debouncer,
 * this version does not use TanStack Store for state management, has no devtools integration,
 * and provides only essential debouncing functionality.
 *
 * Debouncing ensures that a function is only executed after a certain amount of time has passed
 * since its last invocation. This is useful for handling frequent events like window resizing,
 * scroll events, or input changes where you want to limit the rate of execution.
 *
 * The debounced function can be configured to execute either at the start of the delay period
 * (leading edge) or at the end (trailing edge, default). Each new call during the wait period
 * will reset the timer.
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
 * const debouncer = new LiteDebouncer((value: string) => {
 *   saveToDatabase(value);
 * }, {
 *   wait: 500,
 *   onExecute: (args, debouncer) => {
 *     console.log('Saved value:', args[0]);
 *   }
 * });
 *
 * // Will only save after 500ms of no new input
 * inputElement.addEventListener('input', () => {
 *   debouncer.maybeExecute(inputElement.value);
 * });
 * ```
 */
export class LiteDebouncer<TFn extends AnyFunction> {
  private timeoutId: NodeJS.Timeout | undefined
  private lastArgs: Parameters<TFn> | undefined
  private canLeadingExecute = true

  constructor(
    public fn: TFn,
    public options: LiteDebouncerOptions<TFn>,
  ) {
    // Default trailing to true if neither leading nor trailing is specified
    if (
      this.options.leading === undefined &&
      this.options.trailing === undefined
    ) {
      this.options.trailing = true
    }
  }

  /**
   * Attempts to execute the debounced function.
   * If leading is true and this is the first call, executes immediately.
   * Otherwise, queues the execution for after the wait time.
   * Each new call resets the timer.
   */
  maybeExecute = (...args: Parameters<TFn>): void => {
    let didLeadingExecute = false

    if (this.options.leading && this.canLeadingExecute) {
      this.canLeadingExecute = false
      didLeadingExecute = true
      this.fn(...args)
      this.options.onExecute?.(args, this)
    }

    this.lastArgs = args

    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
    }

    this.timeoutId = setTimeout(() => {
      this.canLeadingExecute = true
      if (this.options.trailing && !didLeadingExecute && this.lastArgs) {
        this.fn(...this.lastArgs)
        this.options.onExecute?.(this.lastArgs, this)
      }
      this.lastArgs = undefined
    }, this.options.wait)
  }

  /**
   * Processes the current pending execution immediately.
   * If there's a pending execution, it will be executed right away
   * and the timeout will be cleared.
   */
  flush = (): void => {
    if (this.timeoutId && this.lastArgs) {
      clearTimeout(this.timeoutId)
      this.timeoutId = undefined
      const args = this.lastArgs
      this.fn(...args)
      this.options.onExecute?.(args, this)
      this.lastArgs = undefined
      this.canLeadingExecute = true
    }
  }

  /**
   * Cancels any pending execution.
   * Clears the timeout and resets the internal state.
   */
  cancel = (): void => {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
      this.timeoutId = undefined
    }
    this.lastArgs = undefined
    this.canLeadingExecute = true
  }
}

/**
 * Creates a lightweight debounced function that delays invoking the provided function until after a specified wait time.
 * Multiple calls during the wait period will cancel previous pending invocations and reset the timer.
 *
 * This is an alternative to the debounce function in the core @tanstack/pacer package, but is more
 * suitable for libraries and npm packages that need minimal overhead. Unlike the core version,
 * this function creates a debouncer with no external dependencies, devtools integration, or reactive state.
 *
 * If leading option is true, the function will execute immediately on the first call, then wait the delay
 * before allowing another execution.
 *
 * @example
 * ```ts
 * const debouncedSave = liteDebounce(() => {
 *   saveChanges();
 * }, { wait: 1000 });
 *
 * // Called repeatedly but executes at most once per second
 * inputElement.addEventListener('input', debouncedSave);
 * ```
 *
 * @example
 * ```ts
 * // Leading edge execution - fires immediately then waits
 * const debouncedSearch = liteDebounce((query: string) => {
 *   performSearch(query);
 * }, { wait: 300, leading: true });
 * ```
 */
export function liteDebounce<TFn extends AnyFunction>(
  fn: TFn,
  options: LiteDebouncerOptions<TFn>,
): (...args: Parameters<TFn>) => void {
  const debouncer = new LiteDebouncer(fn, options)
  return debouncer.maybeExecute
}
