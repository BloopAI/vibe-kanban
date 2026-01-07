/**
 * @private
 */
export type AnyUpdater = (prev: any) => any

/**
 * Type-safe updater that can be either a function or direct value
 */
export type Updater<T> = ((prev: T) => T) | T

/**
 * @private
 */
export interface ListenerValue<T> {
  readonly prevVal: T
  readonly currentVal: T
}

/**
 * @private
 */
export type Listener<T> = (value: ListenerValue<T>) => void

/**
 * Type guard to check if updater is a function
 */
export function isUpdaterFunction<T>(
  updater: Updater<T>,
): updater is (prev: T) => T {
  return typeof updater === 'function'
}
