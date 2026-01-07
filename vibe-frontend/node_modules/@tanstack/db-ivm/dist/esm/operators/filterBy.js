import { map } from "./map.js";
import { innerJoin } from "./join.js";
import { consolidate } from "./consolidate.js";
function filterBy(other) {
  return (stream) => {
    const otherKeys = other.pipe(
      map(([key, _]) => [key, null])
    );
    return stream.pipe(
      innerJoin(otherKeys),
      map(([key, [value, _]]) => [key, value]),
      consolidate()
    );
  };
}
export {
  filterBy
};
//# sourceMappingURL=filterBy.js.map
