"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const multiset = require("../multiset.cjs");
const reduce = require("./reduce.cjs");
function topK(comparator, options) {
  const limit = options?.limit ?? Infinity;
  const offset = options?.offset ?? 0;
  return (stream) => {
    const reduced = stream.pipe(
      reduce.reduce((values) => {
        const consolidated = new multiset.MultiSet(values).consolidate();
        const sortedValues = consolidated.getInner().sort((a, b) => comparator(a[0], b[0]));
        return sortedValues.slice(offset, offset + limit);
      })
    );
    return reduced;
  };
}
function topKWithIndex(comparator, options) {
  const limit = options?.limit ?? Infinity;
  const offset = options?.offset ?? 0;
  return (stream) => {
    const reduced = stream.pipe(
      reduce.reduce((values) => {
        const consolidated = new multiset.MultiSet(values).consolidate();
        let i = offset;
        const sortedValues = consolidated.getInner().sort((a, b) => comparator(a[0], b[0])).slice(offset, offset + limit).map(([value, multiplicity]) => [
          [value, i++],
          multiplicity
        ]);
        return sortedValues;
      })
    );
    return reduced;
  };
}
exports.topK = topK;
exports.topKWithIndex = topKWithIndex;
//# sourceMappingURL=topK.cjs.map
