//#region src/lite-queuer.d.ts
/**
 * Position type for addItem and getNextItem operations.
 *
 * - 'front': Operate on the front of the queue (FIFO for getNextItem)
 * - 'back': Operate on the back of the queue (LIFO for getNextItem)
 */
type QueuePosition = 'front' | 'back';
/**
 * Options for configuring a lite queuer instance
 */
interface LiteQueuerOptions<TValue> {
  /**
   * Default position to add items to the queue
   * @default 'back'
   */
  addItemsTo?: QueuePosition;
  /**
   * Default position to get items from during processing
   * @default 'front'
   */
  getItemsFrom?: QueuePosition;
  /**
   * Function to determine priority of items in the queue
   * Higher priority items will be processed first
   * Return undefined for items that should use positional ordering
   */
  getPriority?: (item: TValue) => number | undefined;
  /**
   * Initial items to populate the queue with
   */
  initialItems?: Array<TValue>;
  /**
   * Maximum number of items allowed in the queue
   */
  maxSize?: number;
  /**
   * Whether the queuer should start processing items immediately
   * @default true
   */
  started?: boolean;
  /**
   * Time in milliseconds to wait between processing items
   * @default 0
   */
  wait?: number;
}
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
declare class LiteQueuer<TValue> {
  fn: (item: TValue) => void;
  options: LiteQueuerOptions<TValue>;
  private items;
  private timeoutId;
  private isRunning;
  private pendingTick;
  constructor(fn: (item: TValue) => void, options?: LiteQueuerOptions<TValue>);
  /**
   * Number of items currently in the queue
   */
  get size(): number;
  /**
   * Whether the queue is empty
   */
  get isEmpty(): boolean;
  /**
   * Whether the queue is currently running (auto-processing items)
   */
  get isQueueRunning(): boolean;
  /**
   * Adds an item to the queue. If the queue is full, the item is rejected.
   * Items can be inserted at the front or back, and priority ordering is applied if getPriority is configured.
   *
   * Returns true if the item was added, false if the queue is full.
   *
   * @example
   * ```ts
   * queue.addItem('task1');           // Add to default position (back)
   * queue.addItem('task2', 'front');  // Add to front
   * ```
   */
  addItem: (item: TValue, position?: QueuePosition, startProcessing?: boolean) => boolean;
  private insertAtPosition;
  /**
   * Removes and returns the next item from the queue without executing the function.
   * Use for manual queue management. Normally, use execute() to process items.
   *
   * @example
   * ```ts
   * const nextItem = queue.getNextItem();        // Get from default position (front)
   * const lastItem = queue.getNextItem('back');  // Get from back (LIFO)
   * ```
   */
  getNextItem: (position?: QueuePosition) => TValue | undefined;
  /**
   * Removes and returns the next item from the queue and processes it using the provided function.
   *
   * @example
   * ```ts
   * queue.execute();        // Execute from default position
   * queue.execute('back');  // Execute from back (LIFO)
   * ```
   */
  execute: (position?: QueuePosition) => TValue | undefined;
  /**
   * Internal method that processes items in the queue with wait intervals
   */
  private tick;
  /**
   * Starts processing items in the queue. If already running, does nothing.
   */
  start: () => void;
  /**
   * Stops processing items in the queue. Does not clear the queue.
   */
  stop: () => void;
  /**
   * Clears any pending timeout
   */
  private clearTimeout;
  /**
   * Returns the next item in the queue without removing it.
   *
   * @example
   * ```ts
   * const next = queue.peekNextItem();        // Peek at front
   * const last = queue.peekNextItem('back');  // Peek at back
   * ```
   */
  peekNextItem: (position?: QueuePosition) => TValue | undefined;
  /**
   * Returns a copy of all items in the queue.
   */
  peekAllItems: () => Array<TValue>;
  /**
   * Processes a specified number of items immediately with no wait time.
   * If no numberOfItems is provided, all items will be processed.
   *
   * @example
   * ```ts
   * queue.flush();     // Process all items immediately
   * queue.flush(3);    // Process next 3 items immediately
   * ```
   */
  flush: (numberOfItems?: number, position?: QueuePosition) => void;
  /**
   * Processes all items in the queue as a batch using the provided function.
   * The queue is cleared after processing.
   *
   * @example
   * ```ts
   * queue.flushAsBatch((items) => {
   *   console.log('Processing batch:', items);
   *   // Process all items together
   * });
   * ```
   */
  flushAsBatch: (batchFunction: (items: Array<TValue>) => void) => void;
  /**
   * Removes all items from the queue. Does not affect items being processed.
   */
  clear: () => void;
}
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
declare function liteQueue<TValue>(fn: (item: TValue) => void, options?: LiteQueuerOptions<TValue>): (item: TValue) => boolean;
//#endregion
export { LiteQueuer, LiteQueuerOptions, QueuePosition, liteQueue };
//# sourceMappingURL=lite-queuer.d.cts.map