//#region src/lite-batcher.d.ts
/**
 * Options for configuring a lite batcher instance
 */
interface LiteBatcherOptions<TValue> {
  /**
   * Custom function to determine if a batch should be processed
   * Return true to process the batch immediately
   */
  getShouldExecute?: (items: Array<TValue>, batcher: LiteBatcher<TValue>) => boolean;
  /**
   * Maximum number of items in a batch
   * @default Infinity
   */
  maxSize?: number;
  /**
   * Callback fired after a batch is processed
   */
  onExecute?: (batch: Array<TValue>, batcher: LiteBatcher<TValue>) => void;
  /**
   * Callback fired after items are added to the batcher
   */
  onItemsChange?: (batcher: LiteBatcher<TValue>) => void;
  /**
   * Whether the batcher should start processing immediately
   * @default true
   */
  started?: boolean;
  /**
   * Maximum time in milliseconds to wait before processing a batch.
   * If the wait duration has elapsed, the batch will be processed.
   * If not provided, the batch will not be triggered by a timeout.
   * @default Infinity
   */
  wait?: number | ((batcher: LiteBatcher<TValue>) => number);
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
declare class LiteBatcher<TValue> {
  fn: (items: Array<TValue>) => void;
  options: LiteBatcherOptions<TValue>;
  private items;
  private timeoutId;
  private _isPending;
  constructor(fn: (items: Array<TValue>) => void, options?: LiteBatcherOptions<TValue>);
  /**
   * Number of items currently in the batch
   */
  get size(): number;
  /**
   * Whether the batch has no items to process (items array is empty)
   */
  get isEmpty(): boolean;
  /**
   * Whether the batcher is waiting for the timeout to trigger batch processing
   */
  get isPending(): boolean;
  private getWait;
  /**
   * Adds an item to the batcher
   * If the batch size is reached, timeout occurs, or getShouldExecute returns true, the batch will be processed
   */
  addItem: (item: TValue) => void;
  /**
   * Processes the current batch of items.
   * This method will automatically be triggered if the batcher is running and any of these conditions are met:
   * - The number of items reaches maxSize
   * - The wait duration has elapsed
   * - The getShouldExecute function returns true upon adding an item
   *
   * You can also call this method manually to process the current batch at any time.
   */
  private execute;
  /**
   * Processes the current batch of items immediately
   */
  flush: () => void;
  /**
   * Returns a copy of all items in the batcher
   */
  peekAllItems: () => Array<TValue>;
  private clearTimeout;
  /**
   * Removes all items from the batcher
   */
  clear: () => void;
  /**
   * Cancels any pending execution that was scheduled.
   * Does NOT clear out the items.
   */
  cancel: () => void;
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
declare function liteBatch<TValue>(fn: (items: Array<TValue>) => void, options?: LiteBatcherOptions<TValue>): (item: TValue) => void;
//#endregion
export { LiteBatcher, LiteBatcherOptions, liteBatch };
//# sourceMappingURL=lite-batcher.d.ts.map