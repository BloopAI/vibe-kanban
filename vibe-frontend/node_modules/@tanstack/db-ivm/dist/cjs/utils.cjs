"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
class DefaultMap extends Map {
  constructor(defaultValue, entries) {
    super(entries);
    this.defaultValue = defaultValue;
  }
  get(key) {
    if (!this.has(key)) {
      return this.defaultValue();
    }
    return super.get(key);
  }
  /**
   * Update the value for a key using a function.
   */
  update(key, updater) {
    const value = this.get(key);
    const newValue = updater(value);
    this.set(key, newValue);
    return newValue;
  }
}
const chunkSize = 3e4;
function chunkedArrayPush(array, other) {
  if (other.length <= chunkSize) {
    array.push(...other);
  } else {
    for (let i = 0; i < other.length; i += chunkSize) {
      const chunk = other.slice(i, i + chunkSize);
      array.push(...chunk);
    }
  }
}
function binarySearch(array, value, comparator) {
  let low = 0;
  let high = array.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const comparison = comparator(array[mid], value);
    if (comparison < 0) {
      low = mid + 1;
    } else if (comparison > 0) {
      high = mid;
    } else {
      return mid;
    }
  }
  return low;
}
class ObjectIdGenerator {
  constructor() {
    this.objectIds = /* @__PURE__ */ new WeakMap();
    this.nextId = 0;
  }
  /**
   * Get a unique identifier for any value.
   * - Objects: Uses WeakMap for reference-based identity
   * - Primitives: Uses consistent string-based hashing
   */
  getId(value) {
    if (typeof value !== `object` || value === null) {
      const str = String(value);
      let hashValue = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hashValue = (hashValue << 5) - hashValue + char;
        hashValue = hashValue & hashValue;
      }
      return hashValue;
    }
    if (!this.objectIds.has(value)) {
      this.objectIds.set(value, this.nextId++);
    }
    return this.objectIds.get(value);
  }
  /**
   * Get a string representation of the ID for use in composite keys.
   */
  getStringId(value) {
    if (value === null) return `null`;
    if (value === void 0) return `undefined`;
    if (typeof value !== `object`) return `str_${String(value)}`;
    return `obj_${this.getId(value)}`;
  }
}
const globalObjectIdGenerator = new ObjectIdGenerator();
function diffHalfOpen(a, b) {
  const [a1, a2] = a;
  const [b1, b2] = b;
  const onlyInA = [
    ...range(a1, Math.min(a2, b1)),
    // left side of A outside B
    ...range(Math.max(a1, b2), a2)
    // right side of A outside B
  ];
  const onlyInB = [
    ...range(b1, Math.min(b2, a1)),
    ...range(Math.max(b1, a2), b2)
  ];
  return { onlyInA, onlyInB };
}
function range(start, end) {
  const out = [];
  for (let i = start; i < end; i++) out.push(i);
  return out;
}
function compareKeys(a, b) {
  if (typeof a === typeof b) {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }
  return typeof a === `string` ? -1 : 1;
}
exports.DefaultMap = DefaultMap;
exports.ObjectIdGenerator = ObjectIdGenerator;
exports.binarySearch = binarySearch;
exports.chunkedArrayPush = chunkedArrayPush;
exports.compareKeys = compareKeys;
exports.diffHalfOpen = diffHalfOpen;
exports.globalObjectIdGenerator = globalObjectIdGenerator;
//# sourceMappingURL=utils.cjs.map
