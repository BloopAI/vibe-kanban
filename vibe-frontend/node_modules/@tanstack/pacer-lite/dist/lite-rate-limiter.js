//#region src/lite-rate-limiter.ts
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
var LiteRateLimiter = class {
	constructor(fn, options) {
		this.fn = fn;
		this.options = options;
		this.executionTimes = [];
		this.timeoutIds = /* @__PURE__ */ new Set();
		this.maybeExecute = (...args) => {
			this.cleanupOldExecutions();
			if (this.getExecutionTimesInWindow().length < this.options.limit) {
				this.execute(...args);
				return true;
			}
			this.options.onReject?.(this);
			return false;
		};
		this.execute = (...args) => {
			const now = Date.now();
			this.fn(...args);
			this.options.onExecute?.(args, this);
			this.executionTimes.push(now);
			this.setCleanupTimeout(now);
		};
		this.getExecutionTimesInWindow = () => {
			if (this.options.windowType === "sliding") return this.executionTimes.filter((time) => time > Date.now() - this.options.window);
			else {
				if (this.executionTimes.length === 0) return [];
				const windowStart = Math.min(...this.executionTimes);
				const windowEnd = windowStart + this.options.window;
				if (Date.now() > windowEnd) return [];
				return this.executionTimes.filter((time) => time >= windowStart && time <= windowEnd);
			}
		};
		this.setCleanupTimeout = (executionTime) => {
			if (this.options.windowType === "sliding" || this.timeoutIds.size === 0) {
				const timeUntilExpiration = executionTime - Date.now() + this.options.window + 1;
				const timeoutId = setTimeout(() => {
					this.cleanupOldExecutions();
					this.clearTimeout(timeoutId);
				}, timeUntilExpiration);
				this.timeoutIds.add(timeoutId);
			}
		};
		this.clearTimeout = (timeoutId) => {
			clearTimeout(timeoutId);
			this.timeoutIds.delete(timeoutId);
		};
		this.clearTimeouts = () => {
			this.timeoutIds.forEach((timeoutId) => clearTimeout(timeoutId));
			this.timeoutIds.clear();
		};
		this.cleanupOldExecutions = () => {
			this.executionTimes = this.getExecutionTimesInWindow();
		};
		this.getRemainingInWindow = () => {
			const relevantExecutionTimes = this.getExecutionTimesInWindow();
			return Math.max(0, this.options.limit - relevantExecutionTimes.length);
		};
		this.getMsUntilNextWindow = () => {
			if (this.getRemainingInWindow() > 0) return 0;
			return (this.executionTimes[0] ?? Infinity) + this.options.window - Date.now();
		};
		this.reset = () => {
			this.executionTimes = [];
			this.clearTimeouts();
		};
		if (this.options.windowType === void 0) this.options.windowType = "fixed";
	}
};
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
function liteRateLimit(fn, options) {
	return new LiteRateLimiter(fn, options).maybeExecute;
}

//#endregion
export { LiteRateLimiter, liteRateLimit };
//# sourceMappingURL=lite-rate-limiter.js.map