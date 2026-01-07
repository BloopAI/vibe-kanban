"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const liteDebouncer = require("@tanstack/pacer-lite/lite-debouncer");
function debounceStrategy(options) {
  const debouncer = new liteDebouncer.LiteDebouncer(
    (callback) => callback(),
    options
  );
  return {
    _type: `debounce`,
    options,
    execute: (fn) => {
      debouncer.maybeExecute(fn);
    },
    cleanup: () => {
      debouncer.cancel();
    }
  };
}
exports.debounceStrategy = debounceStrategy;
//# sourceMappingURL=debounceStrategy.cjs.map
