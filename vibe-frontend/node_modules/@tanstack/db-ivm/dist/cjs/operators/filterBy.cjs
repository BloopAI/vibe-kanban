"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const map = require("./map.cjs");
const join = require("./join.cjs");
const consolidate = require("./consolidate.cjs");
function filterBy(other) {
  return (stream) => {
    const otherKeys = other.pipe(
      map.map(([key, _]) => [key, null])
    );
    return stream.pipe(
      join.innerJoin(otherKeys),
      map.map(([key, [value, _]]) => [key, value]),
      consolidate.consolidate()
    );
  };
}
exports.filterBy = filterBy;
//# sourceMappingURL=filterBy.cjs.map
