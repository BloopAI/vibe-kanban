import { MultiSet } from "../multiset.js";
import { reduce } from "./reduce.js";
function topK(comparator, options) {
  const limit = options?.limit ?? Infinity;
  const offset = options?.offset ?? 0;
  return (stream) => {
    const reduced = stream.pipe(
      reduce((values) => {
        const consolidated = new MultiSet(values).consolidate();
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
      reduce((values) => {
        const consolidated = new MultiSet(values).consolidate();
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
export {
  topK,
  topKWithIndex
};
//# sourceMappingURL=topK.js.map
