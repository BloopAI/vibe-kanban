//#region src/lite-throttler.ts
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
var LiteThrottler = class {
	constructor(fn, options) {
		this.fn = fn;
		this.options = options;
		this.lastExecutionTime = 0;
		this.isPending = false;
		this.maybeExecute = (...args) => {
			const timeSinceLastExecution = Date.now() - this.lastExecutionTime;
			if (this.options.leading && timeSinceLastExecution >= this.options.wait) this.execute(...args);
			else {
				this.lastArgs = args;
				if (!this.timeoutId && this.options.trailing) {
					const timeoutDuration = this.options.wait - timeSinceLastExecution;
					this.isPending = true;
					this.timeoutId = setTimeout(() => {
						if (this.lastArgs !== void 0) this.execute(...this.lastArgs);
					}, timeoutDuration);
				}
			}
		};
		this.execute = (...args) => {
			this.fn(...args);
			this.options.onExecute?.(args, this);
			this.lastExecutionTime = Date.now();
			this.clearTimeout();
			this.lastArgs = void 0;
			this.isPending = false;
		};
		this.flush = () => {
			if (this.isPending && this.lastArgs) this.execute(...this.lastArgs);
		};
		this.cancel = () => {
			this.clearTimeout();
			this.lastArgs = void 0;
			this.isPending = false;
		};
		this.clearTimeout = () => {
			if (this.timeoutId) {
				clearTimeout(this.timeoutId);
				this.timeoutId = void 0;
			}
		};
		if (this.options.leading === void 0 && this.options.trailing === void 0) {
			this.options.leading = true;
			this.options.trailing = true;
		}
	}
};
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
function liteThrottle(fn, options) {
	return new LiteThrottler(fn, options).maybeExecute;
}

//#endregion
export { LiteThrottler, liteThrottle };
//# sourceMappingURL=lite-throttler.js.map