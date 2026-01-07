//#region src/lite-queuer.ts
/**
* A lightweight class that creates a queue for processing items.
*
* This is an alternative to the Queuer in the core @tanstack/pacer package, but is more
* suitable for libraries and npm packages that need minimal overhead. Unlike the core Queuer,
* this version does not use TanStack Store for state management, has no devtools integration,
* no callbacks, and provides only essential queueing functionality.
*
* The queuer supports FIFO (First In First Out), LIFO (Last In First Out), and priority-based
* processing of items. Items can be processed automatically with configurable wait times
* between executions, or processed manually using the execute methods.
*
* Features included:
* - Automatic or manual processing of items
* - FIFO, LIFO, and priority-based ordering
* - Queue size limits with item rejection
* - Configurable wait times between processing
* - Batch processing capabilities
* - Start/stop processing control
* - Callback support for monitoring execution, rejection, and state change events
*
* Features NOT included (compared to core Queuer):
* - No TanStack Store state management
* - No devtools integration
* - No item expiration functionality (no onExpire callback)
* - No dynamic options updates (setOptions)
* - No detailed state tracking (execution counts, etc.)
*
* Queue behavior:
* - Default: FIFO (add to back, process from front)
* - LIFO: Configure addItemsTo: 'back', getItemsFrom: 'back'
* - Priority: Provide getPriority function; higher values processed first
*
* @example
* ```ts
* // Basic FIFO queue
* const queue = new LiteQueuer((item: string) => {
*   console.log('Processing:', item);
* }, { wait: 100 });
*
* queue.addItem('task1');
* queue.addItem('task2');
* // Processes: task1, then task2 after 100ms delay
* ```
*
* @example
* ```ts
* // Priority queue
* const priorityQueue = new LiteQueuer((item: Task) => {
*   processTask(item);
* }, {
*   getPriority: task => task.priority,
*   wait: 500
* });
*
* priorityQueue.addItem({ name: 'low', priority: 1 });
* priorityQueue.addItem({ name: 'high', priority: 10 });
* // Processes high priority task first
* ```
*/
var LiteQueuer = class {
	constructor(fn, options = {}) {
		this.fn = fn;
		this.options = options;
		this.items = [];
		this.timeoutId = null;
		this.isRunning = true;
		this.pendingTick = false;
		this.addItem = (item, position = this.options.addItemsTo, startProcessing = true) => {
			if (this.items.length >= this.options.maxSize) return false;
			if (this.options.getPriority) {
				const priority = this.options.getPriority(item);
				if (priority !== void 0) {
					const insertIndex = this.items.findIndex((existing) => {
						return (this.options.getPriority(existing) ?? -Infinity) < priority;
					});
					if (insertIndex === -1) this.items.push(item);
					else this.items.splice(insertIndex, 0, item);
				} else this.insertAtPosition(item, position);
			} else this.insertAtPosition(item, position);
			if (startProcessing && this.isRunning && !this.pendingTick) this.tick();
			return true;
		};
		this.insertAtPosition = (item, position) => {
			if (position === "front") this.items.unshift(item);
			else this.items.push(item);
		};
		this.getNextItem = (position = this.options.getItemsFrom) => {
			if (this.items.length === 0) return;
			let item;
			if (this.options.getPriority || position === "front") item = this.items.shift();
			else item = this.items.pop();
			return item;
		};
		this.execute = (position) => {
			const item = this.getNextItem(position);
			if (item !== void 0) this.fn(item);
			return item;
		};
		this.tick = () => {
			if (!this.isRunning) {
				this.pendingTick = false;
				return;
			}
			this.pendingTick = true;
			while (this.items.length > 0) {
				if (this.execute(this.options.getItemsFrom) === void 0) break;
				const wait = this.options.wait;
				if (wait > 0) {
					this.timeoutId = setTimeout(() => this.tick(), wait);
					return;
				}
			}
			this.pendingTick = false;
		};
		this.start = () => {
			this.isRunning = true;
			if (!this.pendingTick && this.items.length > 0) this.tick();
		};
		this.stop = () => {
			this.clearTimeout();
			this.isRunning = false;
			this.pendingTick = false;
		};
		this.clearTimeout = () => {
			if (this.timeoutId) {
				clearTimeout(this.timeoutId);
				this.timeoutId = null;
			}
		};
		this.peekNextItem = (position = "front") => {
			if (this.items.length === 0) return;
			if (this.options.getPriority || position === "front") return this.items[0];
			else return this.items[this.items.length - 1];
		};
		this.peekAllItems = () => {
			return [...this.items];
		};
		this.flush = (numberOfItems = this.items.length, position) => {
			this.clearTimeout();
			for (let i = 0; i < numberOfItems && this.items.length > 0; i++) this.execute(position);
			if (this.isRunning && this.items.length > 0 && !this.pendingTick) this.tick();
		};
		this.flushAsBatch = (batchFunction) => {
			const items = this.peekAllItems();
			this.clear();
			batchFunction(items);
		};
		this.clear = () => {
			this.items = [];
		};
		this.options.addItemsTo = this.options.addItemsTo ?? "back";
		this.options.getItemsFrom = this.options.getItemsFrom ?? "front";
		this.options.maxSize = this.options.maxSize ?? Infinity;
		this.options.started = this.options.started ?? true;
		this.options.wait = this.options.wait ?? 0;
		this.isRunning = this.options.started;
		if (this.options.initialItems) for (const item of this.options.initialItems) this.addItem(item, this.options.addItemsTo, false);
		if (this.isRunning && this.items.length > 0) this.tick();
	}
	/**
	* Number of items currently in the queue
	*/
	get size() {
		return this.items.length;
	}
	/**
	* Whether the queue is empty
	*/
	get isEmpty() {
		return this.items.length === 0;
	}
	/**
	* Whether the queue is currently running (auto-processing items)
	*/
	get isQueueRunning() {
		return this.isRunning;
	}
};
/**
* Creates a lightweight queue that processes items using the provided function.
*
* This is an alternative to the queue function in the core @tanstack/pacer package, but is more
* suitable for libraries and npm packages that need minimal overhead. Unlike the core version,
* this function creates a queuer with no external dependencies, devtools integration, or reactive state.
*
* @example
* ```ts
* const processItem = liteQueue((item: string) => {
*   console.log('Processing:', item);
* }, { wait: 1000 });
*
* processItem('task1');
* processItem('task2');
* // Processes each item with 1 second delay between them
* ```
*/
function liteQueue(fn, options = {}) {
	const queuer = new LiteQueuer(fn, options);
	return (item) => queuer.addItem(item);
}

//#endregion
export { LiteQueuer, liteQueue };
//# sourceMappingURL=lite-queuer.js.map