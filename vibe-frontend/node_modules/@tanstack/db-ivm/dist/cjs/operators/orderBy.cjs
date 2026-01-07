"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const topK = require("./topK.cjs");
const topKWithFractionalIndex = require("./topKWithFractionalIndex.cjs");
const map = require("./map.cjs");
const join = require("./join.cjs");
const consolidate = require("./consolidate.cjs");
function orderBy(valueExtractor, options) {
  const limit = options?.limit ?? Infinity;
  const offset = options?.offset ?? 0;
  const comparator = options?.comparator ?? ((a, b) => {
    if (a === b) return 0;
    if (a < b) return -1;
    return 1;
  });
  return (stream) => {
    return stream.pipe(
      map.map(
        ([key, value]) => [
          null,
          [
            key,
            valueExtractor(
              value
            )
          ]
        ]
      ),
      topK.topK((a, b) => comparator(a[1], b[1]), { limit, offset }),
      map.map(([_, [key]]) => [key, null]),
      join.innerJoin(stream),
      map.map(([key, value]) => {
        return [key, value[1]];
      }),
      consolidate.consolidate()
    );
  };
}
function orderByWithIndex(valueExtractor, options) {
  const limit = options?.limit ?? Infinity;
  const offset = options?.offset ?? 0;
  const comparator = options?.comparator ?? ((a, b) => {
    if (a === b) return 0;
    if (a < b) return -1;
    return 1;
  });
  return (stream) => {
    return stream.pipe(
      map.map(
        ([key, value]) => [
          null,
          [
            key,
            valueExtractor(
              value
            )
          ]
        ]
      ),
      topK.topKWithIndex((a, b) => comparator(a[1], b[1]), { limit, offset }),
      map.map(([_, [[key], index]]) => [key, index]),
      join.innerJoin(stream),
      map.map(([key, [index, value]]) => {
        return [key, [value, index]];
      }),
      consolidate.consolidate()
    );
  };
}
function orderByWithFractionalIndexBase(topKFunction, valueExtractor, options) {
  const limit = options?.limit ?? Infinity;
  const offset = options?.offset ?? 0;
  const setSizeCallback = options?.setSizeCallback;
  const setWindowFn = options?.setWindowFn;
  const comparator = options?.comparator ?? ((a, b) => {
    if (a === b) return 0;
    if (a < b) return -1;
    return 1;
  });
  return (stream) => {
    return stream.pipe(
      topKFunction(
        (a, b) => comparator(valueExtractor(a), valueExtractor(b)),
        {
          limit,
          offset,
          setSizeCallback,
          setWindowFn
        }
      ),
      consolidate.consolidate()
    );
  };
}
function orderByWithFractionalIndex(valueExtractor, options) {
  return orderByWithFractionalIndexBase(
    topKWithFractionalIndex.topKWithFractionalIndex,
    valueExtractor,
    options
  );
}
exports.orderBy = orderBy;
exports.orderByWithFractionalIndex = orderByWithFractionalIndex;
exports.orderByWithFractionalIndexBase = orderByWithFractionalIndexBase;
exports.orderByWithIndex = orderByWithIndex;
//# sourceMappingURL=orderBy.cjs.map
