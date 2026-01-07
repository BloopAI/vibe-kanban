// Type definitions for requestIdleCallback - compatible with existing browser types
export type IdleCallbackDeadline = {
  didTimeout: boolean
  timeRemaining: () => number
}

export type IdleCallbackFunction = (deadline: IdleCallbackDeadline) => void

const requestIdleCallbackPolyfill = (
  callback: IdleCallbackFunction,
): number => {
  // Use a very small timeout for the polyfill to simulate idle time
  const timeout = 0
  const timeoutId = setTimeout(() => {
    callback({
      didTimeout: true, // Always indicate timeout for the polyfill
      timeRemaining: () => 50, // Return some time remaining for polyfill
    })
  }, timeout)
  return timeoutId as unknown as number
}

const cancelIdleCallbackPolyfill = (id: number): void => {
  clearTimeout(id as unknown as ReturnType<typeof setTimeout>)
}

export const safeRequestIdleCallback: (
  callback: IdleCallbackFunction,
  options?: { timeout?: number },
) => number =
  typeof window !== `undefined` && `requestIdleCallback` in window
    ? (callback, options) =>
        (window as any).requestIdleCallback(callback, options)
    : (callback, _options) => requestIdleCallbackPolyfill(callback)

export const safeCancelIdleCallback: (id: number) => void =
  typeof window !== `undefined` && `cancelIdleCallback` in window
    ? (id) => (window as any).cancelIdleCallback(id)
    : cancelIdleCallbackPolyfill
