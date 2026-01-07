import { topK, topKWithIndex } from "./topK.js";
import { topKWithFractionalIndex } from "./topKWithFractionalIndex.js";
import { map } from "./map.js";
import { innerJoin } from "./join.js";
import { consolidate } from "./consolidate.js";
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
      map(
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
      topK((a, b) => comparator(a[1], b[1]), { limit, offset }),
      map(([_, [key]]) => [key, null]),
      innerJoin(stream),
      map(([key, value]) => {
        return [key, value[1]];
      }),
      consolidate()
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
      map(
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
      topKWithIndex((a, b) => comparator(a[1], b[1]), { limit, offset }),
      map(([_, [[key], index]]) => [key, index]),
      innerJoin(stream),
      map(([key, [index, value]]) => {
        return [key, [value, index]];
      }),
      consolidate()
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
      consolidate()
    );
  };
}
function orderByWithFractionalIndex(valueExtractor, options) {
  return orderByWithFractionalIndexBase(
    topKWithFractionalIndex,
    valueExtractor,
    options
  );
}
export {
  orderBy,
  orderByWithFractionalIndex,
  orderByWithFractionalIndexBase,
  orderByWithIndex
};
//# sourceMappingURL=orderBy.js.map
