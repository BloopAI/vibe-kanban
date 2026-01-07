/**
 * Options for configuring a lite batcher instance
 */
export interface LiteBatcherOptions<TValue> {
  /**
   * Custom function to determine if a batch should be processed
   * Return true to process the batch immediately
   */
  getShouldExecute?: (
    items: Array<TValue>,
    batcher: LiteBatcher<TValue>,
  ) => boolean
  /**
   * Maximum number of items in a batch
   * @default Infinity
   */
  maxSize?: number
  /**
   * Callback fired after a batch is processed
   */
  onExecute?: (batch: Array<TValue>, batcher: LiteBatcher<TValue>) => void
  /**
   * Callback fired after items are added to the batcher
   */
  onItemsChange?: (batcher: LiteBatcher<TValue>) => void
  /**
   * Whether the batcher should start processing immediately
   * @default true
   */
  started?: boolean
  /**
   * Maximum time in milliseconds to wait before processing a batch.
   * If the wait duration has elapsed, the batch will be processed.
   * If not provided, the batch will not be triggered by a timeout.
   * @default Infinity
   */
  wait?: number | ((batcher: LiteBatcher<TValue>) => number)
}

/**
 * A lightweight class that collects items and processes them in batches.
 *
 * This is an alternative to the Batcher in the core @tanstack/pacer package, but is more
 * suitable for libraries and npm packages that need minimal overhead. Unlike the core Batcher,
 * this version does not use TanStack Store for state management, has no devtools integration,
 * no callbacks, and provides only essential batching functionality.
 *
 * Batching is a technique for grouping multiple operations together to be processed as a single unit.
 * This synchronous version is lighter weight and often all you need.
 *
 * The Batcher provides a flexible way to implement batching with configurable:
 * - Maximum batch size (number of items per batch)
 * - Time-based batching (process after X milliseconds)
 * - Custom batch processing logic via getShouldExecute
 *
 * Features included:
 * - Core batching functionality (addItem, flush, clear, cancel)
 * - Size-based batching (maxSize)
 * - Time-based batching (wait timeout)
 * - Custom condition batching (getShouldExecute)
 * - Manual processing controls
 * - Public mutable options
 * - Callback support for monitoring batch execution and state changes
 *
 * Features NOT included (compared to core Batcher):
 * - No TanStack Store state management
 * - No devtools integration
 * - No complex state tracking (execution counts, etc.)
 * - No reactive state management
 *
 * @example
 * ```ts
 * // Basic batching
 * const batcher = new LiteBatcher<number>(
 *   (items) => console.log('Processing batch:', items),
 *   {
 *     maxSize: 5,
 *     wait: 2000,
 *     onExecute: (batch, batcher) => {
 *       console.log('Batch executed with', batch.length, 'items');
 *     },
 *     onItemsChange: (batcher) => {
 *       console.log('Batch size changed to:', batcher.size);
 *     }
 *   }
 * );
 *
 * batcher.addItem(1);
 * batcher.addItem(2);
 * // After 2 seconds or when 5 items are added, whichever comes first,
 * // the batch will be processed
 * ```
 *
 * @example
 * ```ts
 * // Custom condition batching
 * const batcher = new LiteBatcher<Task>(
 *   (items) => processTasks(items),
 *   {
 *     getShouldExecute: (items) => items.some(task => task.urgent),
 *     maxSize: 10,
 *   }
 * );
 *
 * batcher.addItem({ name: 'normal', urgent: false });
 * batcher.addItem({ name: 'urgent', urgent: true }); // Triggers immediate processing
 * ```
 */
export class LiteBatcher<TValue> {
  private items: Array<TValue> = []
  private timeoutId: NodeJS.Timeout | null = null
  private _isPending = false

  constructor(
    public fn: (items: Array<TValue>) => void,
    public options: LiteBatcherOptions<TValue> = {},
  ) {
    // Set defaults
    this.options.maxSize = this.options.maxSize ?? Infinity
    this.options.started = this.options.started ?? true
    this.options.wait = this.options.wait ?? Infinity
    this.options.getShouldExecute =
      this.options.getShouldExecute ?? (() => false)
  }

  /**
   * Number of items currently in the batch
   */
  get size(): number {
    return this.items.length
  }

  /**
   * Whether the batch has no items to process (items array is empty)
   */
  get isEmpty(): boolean {
    return this.items.length === 0
  }

  /**
   * Whether the batcher is waiting for the timeout to trigger batch processing
   */
  get isPending(): boolean {
    return this._isPending
  }

  private getWait(): number {
    if (typeof this.options.wait === 'function') {
      return this.options.wait(this)
    }
    return this.options.wait!
  }

  /**
   * Adds an item to the batcher
   * If the batch size is reached, timeout occurs, or getShouldExecute returns true, the batch will be processed
   */
  addItem = (item: TValue): void => {
    this.items.push(item)
    this._isPending = this.options.wait !== Infinity
    this.options.onItemsChange?.(this)

    const shouldProcess =
      this.items.length >= this.options.maxSize! ||
      this.options.getShouldExecute!(this.items, this)

    if (shouldProcess) {
      this.execute()
    } else if (this.options.wait !== Infinity) {
      this.clearTimeout() // clear any pending timeout to replace it with a new one
      this.timeoutId = setTimeout(() => this.execute(), this.getWait())
    }
  }

  /**
   * Processes the current batch of items.
   * This method will automatically be triggered if the batcher is running and any of these conditions are met:
   * - The number of items reaches maxSize
   * - The wait duration has elapsed
   * - The getShouldExecute function returns true upon adding an item
   *
   * You can also call this method manually to process the current batch at any time.
   */
  private execute = (): void => {
    if (this.items.length === 0) {
      return
    }

    const batch = this.peekAllItems() // copy of the items to be processed (to prevent race conditions)
    this.clear() // Clear items before processing to prevent race conditions

    this.fn(batch) // EXECUTE
    this.options.onExecute?.(batch, this)
  }

  /**
   * Processes the current batch of items immediately
   */
  flush = (): void => {
    this.clearTimeout() // clear any pending timeout
    this.execute() // execute immediately
  }

  /**
   * Returns a copy of all items in the batcher
   */
  peekAllItems = (): Array<TValue> => {
    return [...this.items]
  }

  private clearTimeout = (): void => {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
      this.timeoutId = null
    }
  }

  /**
   * Removes all items from the batcher
   */
  clear = (): void => {
    const hadItems = this.items.length > 0
    this.items = []
    this._isPending = false
    if (hadItems) {
      this.options.onItemsChange?.(this)
    }
  }

  /**
   * Cancels any pending execution that was scheduled.
   * Does NOT clear out the items.
   */
  cancel = (): void => {
    this.clearTimeout()
    this._isPending = false
  }
}

/**
 * Creates a batcher that processes items in batches.
 *
 * This is an alternative to the batch function in the core @tanstack/pacer package, but is more
 * suitable for libraries and npm packages that need minimal overhead. Unlike the core version,
 * this function creates a batcher with no external dependencies, devtools integration, or reactive state.
 *
 * @example
 * ```ts
 * const batchItems = liteBatch<number>(
 *   (items) => console.log('Processing:', items),
 *   {
 *     maxSize: 3,
 *   }
 * );
 *
 * batchItems(1);
 * batchItems(2);
 * batchItems(3); // Triggers batch processing
 * ```
 */
export function liteBatch<TValue>(
  fn: (items: Array<TValue>) => void,
  options: LiteBatcherOptions<TValue> = {},
): (item: TValue) => void {
  const batcher = new LiteBatcher<TValue>(fn, options)
  return batcher.addItem
}
