"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const liteThrottler = require("@tanstack/pacer-lite/lite-throttler");
function throttleStrategy(options) {
  const throttler = new liteThrottler.LiteThrottler(
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
exports.throttleStrategy = throttleStrategy;
//# sourceMappingURL=throttleStrategy.cjs.map
