"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const map = require("./map.cjs");
function keyBy(keyFn) {
  return map.map((value) => [keyFn(value), value]);
}
function unkey() {
  return map.map(([_, value]) => value);
}
function rekey(keyFn) {
  return map.map(([_, value]) => [keyFn(value), value]);
}
exports.keyBy = keyBy;
exports.rekey = rekey;
exports.unkey = unkey;
//# sourceMappingURL=keying.cjs.map
