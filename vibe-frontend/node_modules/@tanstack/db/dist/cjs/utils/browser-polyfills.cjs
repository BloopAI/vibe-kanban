"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const requestIdleCallbackPolyfill = (callback) => {
  const timeout = 0;
  const timeoutId = setTimeout(() => {
    callback({
      didTimeout: true,
      // Always indicate timeout for the polyfill
      timeRemaining: () => 50
      // Return some time remaining for polyfill
    });
  }, timeout);
  return timeoutId;
};
const cancelIdleCallbackPolyfill = (id) => {
  clearTimeout(id);
};
const safeRequestIdleCallback = typeof window !== `undefined` && `requestIdleCallback` in window ? (callback, options) => window.requestIdleCallback(callback, options) : (callback, _options) => requestIdleCallbackPolyfill(callback);
const safeCancelIdleCallback = typeof window !== `undefined` && `cancelIdleCallback` in window ? (id) => window.cancelIdleCallback(id) : cancelIdleCallbackPolyfill;
exports.safeCancelIdleCallback = safeCancelIdleCallback;
exports.safeRequestIdleCallback = safeRequestIdleCallback;
//# sourceMappingURL=browser-polyfills.cjs.map
