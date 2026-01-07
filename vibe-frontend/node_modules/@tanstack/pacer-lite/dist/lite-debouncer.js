//#region src/lite-debouncer.ts
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
var LiteDebouncer = class {
	constructor(fn, options) {
		this.fn = fn;
		this.options = options;
		this.canLeadingExecute = true;
		this.maybeExecute = (...args) => {
			let didLeadingExecute = false;
			if (this.options.leading && this.canLeadingExecute) {
				this.canLeadingExecute = false;
				didLeadingExecute = true;
				this.fn(...args);
				this.options.onExecute?.(args, this);
			}
			this.lastArgs = args;
			if (this.timeoutId) clearTimeout(this.timeoutId);
			this.timeoutId = setTimeout(() => {
				this.canLeadingExecute = true;
				if (this.options.trailing && !didLeadingExecute && this.lastArgs) {
					this.fn(...this.lastArgs);
					this.options.onExecute?.(this.lastArgs, this);
				}
				this.lastArgs = void 0;
			}, this.options.wait);
		};
		this.flush = () => {
			if (this.timeoutId && this.lastArgs) {
				clearTimeout(this.timeoutId);
				this.timeoutId = void 0;
				const args = this.lastArgs;
				this.fn(...args);
				this.options.onExecute?.(args, this);
				this.lastArgs = void 0;
				this.canLeadingExecute = true;
			}
		};
		this.cancel = () => {
			if (this.timeoutId) {
				clearTimeout(this.timeoutId);
				this.timeoutId = void 0;
			}
			this.lastArgs = void 0;
			this.canLeadingExecute = true;
		};
		if (this.options.leading === void 0 && this.options.trailing === void 0) this.options.trailing = true;
	}
};
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
function liteDebounce(fn, options) {
	return new LiteDebouncer(fn, options).maybeExecute;
}

//#endregion
export { LiteDebouncer, liteDebounce };
//# sourceMappingURL=lite-debouncer.js.map