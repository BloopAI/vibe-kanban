"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
function isPromiseLike(value) {
  return !!value && (typeof value === `object` || typeof value === `function`) && typeof value.then === `function`;
}
exports.isPromiseLike = isPromiseLike;
//# sourceMappingURL=type-guards.cjs.map
