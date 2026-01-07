/**
 * Type guard to check if a value is promise-like (has a `.then` method)
 * @param value - The value to check
 * @returns True if the value is promise-like, false otherwise
 */
export function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    !!value &&
    (typeof value === `object` || typeof value === `function`) &&
    typeof (value as { then?: unknown }).then === `function`
  )
}
