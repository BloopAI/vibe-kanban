import { LiteDebouncer } from "@tanstack/pacer-lite/lite-debouncer";
function debounceStrategy(options) {
  const debouncer = new LiteDebouncer(
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
export {
  debounceStrategy
};
//# sourceMappingURL=debounceStrategy.js.map
