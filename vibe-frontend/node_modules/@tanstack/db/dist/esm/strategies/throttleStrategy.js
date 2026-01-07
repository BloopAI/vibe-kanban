import { LiteThrottler } from "@tanstack/pacer-lite/lite-throttler";
function throttleStrategy(options) {
  const throttler = new LiteThrottler(
    (callback) => callback(),
    options
  );
  return {
    _type: `throttle`,
    options,
    execute: (fn) => {
      throttler.maybeExecute(fn);
    },
    cleanup: () => {
      throttler.cancel();
    }
  };
}
export {
  throttleStrategy
};
//# sourceMappingURL=throttleStrategy.js.map
