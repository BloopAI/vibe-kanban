/**
 * Position type for addItem and getNextItem operations.
 *
 * - 'front': Operate on the front of the queue (FIFO for getNextItem)
 * - 'back': Operate on the back of the queue (LIFO for getNextItem)
 */
export type QueuePosition = 'front' | 'back'

/**
 * Options for configuring a lite queuer instance
 */
export interface LiteQueuerOptions<TValue> {
  /**
   * Default position to add items to the queue
   * @default 'back'
   */
  addItemsTo?: QueuePosition
  /**
   * Default position to get items from during processing
   * @default 'front'
   */
  getItemsFrom?: QueuePosition
  /**
   * Function to determine priority of items in the queue
   * Higher priority items will be processed first
   * Return undefined for items that should use positional ordering
   */
  getPriority?: (item: TValue) => number | undefined
  /**
   * Initial items to populate the queue with
   */
  initialItems?: Array<TValue>
  /**
   * Maximum number of items allowed in the queue
   */
  maxSize?: number
  /**
   * Whether the queuer should start processing items immediately
   * @default true
   */
  started?: boolean
  /**
   * Time in milliseconds to wait between processing items
   * @default 0
   */
  wait?: number
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
export class LiteQueuer<TValue> {
  private items: Array<TValue> = []
  private timeoutId: NodeJS.Timeout | null = null
  private isRunning = true
  private pendingTick = false

  constructor(
    public fn: (item: TValue) => void,
    public options: LiteQueuerOptions<TValue> = {},
  ) {
    // Set defaults
    this.options.addItemsTo = this.options.addItemsTo ?? 'back'
    this.options.getItemsFrom = this.options.getItemsFrom ?? 'front'
    this.options.maxSize = this.options.maxSize ?? Infinity
    this.options.started = this.options.started ?? true
    this.options.wait = this.options.wait ?? 0

    this.isRunning = this.options.started

    // Add initial items if provided
    if (this.options.initialItems) {
      for (const item of this.options.initialItems) {
        this.addItem(item, this.options.addItemsTo, false)
      }
    }

    // Start processing if enabled and has items
    if (this.isRunning && this.items.length > 0) {
      this.tick()
    }
  }

  /**
   * Number of items currently in the queue
   */
  get size(): number {
    return this.items.length
  }

  /**
   * Whether the queue is empty
   */
  get isEmpty(): boolean {
    return this.items.length === 0
  }

  /**
   * Whether the queue is currently running (auto-processing items)
   */
  get isQueueRunning(): boolean {
    return this.isRunning
  }

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
  addItem = (
    item: TValue,
    position: QueuePosition = this.options.addItemsTo!,
    startProcessing: boolean = true,
  ): boolean => {
    // Check size limit
    if (this.items.length >= this.options.maxSize!) {
      return false
    }

    // Handle priority insertion
    if (this.options.getPriority) {
      const priority = this.options.getPriority(item)
      if (priority !== undefined) {
        // Find insertion point for priority
        const insertIndex = this.items.findIndex((existing) => {
          const existingPriority = this.options.getPriority!(existing)
          // Treat undefined priority as negative infinity for comparison
          const effectivePriority = existingPriority ?? -Infinity
          return effectivePriority < priority
        })

        if (insertIndex === -1) {
          this.items.push(item)
        } else {
          this.items.splice(insertIndex, 0, item)
        }
      } else {
        // No priority, use position
        this.insertAtPosition(item, position)
      }
    } else {
      // No priority function, use position
      this.insertAtPosition(item, position)
    }

    // Start processing if running and not already processing
    if (startProcessing && this.isRunning && !this.pendingTick) {
      this.tick()
    }

    return true
  }

  private insertAtPosition = (item: TValue, position: QueuePosition): void => {
    if (position === 'front') {
      this.items.unshift(item)
    } else {
      this.items.push(item)
    }
  }

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
  getNextItem = (
    position: QueuePosition = this.options.getItemsFrom!,
  ): TValue | undefined => {
    if (this.items.length === 0) {
      return undefined
    }

    let item: TValue | undefined

    // When priority function is provided, always get from front (highest priority)
    if (this.options.getPriority || position === 'front') {
      item = this.items.shift()
    } else {
      item = this.items.pop()
    }

    return item
  }

  /**
   * Removes and returns the next item from the queue and processes it using the provided function.
   *
   * @example
   * ```ts
   * queue.execute();        // Execute from default position
   * queue.execute('back');  // Execute from back (LIFO)
   * ```
   */
  execute = (position?: QueuePosition): TValue | undefined => {
    const item = this.getNextItem(position)
    if (item !== undefined) {
      this.fn(item)
    }
    return item
  }

  /**
   * Internal method that processes items in the queue with wait intervals
   */
  private tick = (): void => {
    if (!this.isRunning) {
      this.pendingTick = false
      return
    }

    this.pendingTick = true

    // Process items while queue is not empty
    while (this.items.length > 0) {
      const item = this.execute(this.options.getItemsFrom)
      if (item === undefined) {
        break
      }

      const wait = this.options.wait!
      if (wait > 0) {
        // Schedule next processing after wait time
        this.timeoutId = setTimeout(() => this.tick(), wait)
        return
      }

      // No wait time, continue processing immediately
    }

    this.pendingTick = false
  }

  /**
   * Starts processing items in the queue. If already running, does nothing.
   */
  start = (): void => {
    this.isRunning = true
    if (!this.pendingTick && this.items.length > 0) {
      this.tick()
    }
  }

  /**
   * Stops processing items in the queue. Does not clear the queue.
   */
  stop = (): void => {
    this.clearTimeout()
    this.isRunning = false
    this.pendingTick = false
  }

  /**
   * Clears any pending timeout
   */
  private clearTimeout = (): void => {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
      this.timeoutId = null
    }
  }

  /**
   * Returns the next item in the queue without removing it.
   *
   * @example
   * ```ts
   * const next = queue.peekNextItem();        // Peek at front
   * const last = queue.peekNextItem('back');  // Peek at back
   * ```
   */
  peekNextItem = (position: QueuePosition = 'front'): TValue | undefined => {
    if (this.items.length === 0) {
      return undefined
    }

    if (this.options.getPriority || position === 'front') {
      return this.items[0]
    } else {
      return this.items[this.items.length - 1]
    }
  }

  /**
   * Returns a copy of all items in the queue.
   */
  peekAllItems = (): Array<TValue> => {
    return [...this.items]
  }

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
  flush = (
    numberOfItems: number = this.items.length,
    position?: QueuePosition,
  ): void => {
    this.clearTimeout() // Clear any pending timeout
    for (let i = 0; i < numberOfItems && this.items.length > 0; i++) {
      this.execute(position)
    }
    // Restart normal processing if still running and has items
    if (this.isRunning && this.items.length > 0 && !this.pendingTick) {
      this.tick()
    }
  }

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
  flushAsBatch = (batchFunction: (items: Array<TValue>) => void): void => {
    const items = this.peekAllItems()
    this.clear()
    batchFunction(items)
  }

  /**
   * Removes all items from the queue. Does not affect items being processed.
   */
  clear = (): void => {
    this.items = []
  }
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
export function liteQueue<TValue>(
  fn: (item: TValue) => void,
  options: LiteQueuerOptions<TValue> = {},
): (item: TValue) => boolean {
  const queuer = new LiteQueuer(fn, options)
  return (item: TValue) => queuer.addItem(item)
}
