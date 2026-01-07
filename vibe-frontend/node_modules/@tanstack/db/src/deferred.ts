/**
 * A Deferred object represents a Promise that can be resolved or rejected
 * from outside the Promise constructor.
 */
export interface Deferred<T> {
  /** The Promise object being controlled */
  promise: Promise<T>

  /** Function to resolve the Promise with a value or another Promise */
  resolve: (value: T | PromiseLike<T>) => void

  /** Function to reject the Promise with an error */
  reject: (reason?: Error | unknown) => void

  /** Check if the Promise has been resolved or rejected */
  isPending: () => boolean
}

/**
 * Creates a Deferred object containing a Promise and methods to control it.
 *
 * @returns A Deferred object with promise, resolve, reject, and isPending methods
 */
export function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: Error | unknown) => void
  let isPending = true

  const promise = new Promise<T>((res, rej) => {
    resolve = (value) => {
      isPending = false
      res(value)
    }

    reject = (reason) => {
      isPending = false
      rej(reason)
    }
  })

  return {
    promise,
    resolve,
    reject,
    isPending: () => isPending,
  }
}
