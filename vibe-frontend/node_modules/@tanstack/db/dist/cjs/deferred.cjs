"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
function createDeferred() {
  let resolve;
  let reject;
  let isPending = true;
  const promise = new Promise((res, rej) => {
    resolve = (value) => {
      isPending = false;
      res(value);
    };
    reject = (reason) => {
      isPending = false;
      rej(reason);
    };
  });
  return {
    promise,
    resolve,
    reject,
    isPending: () => isPending
  };
}
exports.createDeferred = createDeferred;
//# sourceMappingURL=deferred.cjs.map
