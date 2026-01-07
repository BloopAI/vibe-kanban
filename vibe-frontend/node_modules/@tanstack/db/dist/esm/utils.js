function deepEquals(a, b) {
  return deepEqualsInternal(a, b, /* @__PURE__ */ new Map());
}
function deepEqualsInternal(a, b, visited) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (a instanceof Date) {
    if (!(b instanceof Date)) return false;
    return a.getTime() === b.getTime();
  }
  if (a instanceof RegExp) {
    if (!(b instanceof RegExp)) return false;
    return a.source === b.source && a.flags === b.flags;
  }
  if (a instanceof Map) {
    if (!(b instanceof Map)) return false;
    if (a.size !== b.size) return false;
    if (visited.has(a)) {
      return visited.get(a) === b;
    }
    visited.set(a, b);
    const entries = Array.from(a.entries());
    const result = entries.every(([key, val]) => {
      return b.has(key) && deepEqualsInternal(val, b.get(key), visited);
    });
    visited.delete(a);
    return result;
  }
  if (a instanceof Set) {
    if (!(b instanceof Set)) return false;
    if (a.size !== b.size) return false;
    if (visited.has(a)) {
      return visited.get(a) === b;
    }
    visited.set(a, b);
    const aValues = Array.from(a);
    const bValues = Array.from(b);
    if (aValues.every((val) => typeof val !== `object`)) {
      visited.delete(a);
      return aValues.every((val) => b.has(val));
    }
    const result = aValues.length === bValues.length;
    visited.delete(a);
    return result;
  }
  if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b) && !(a instanceof DataView) && !(b instanceof DataView)) {
    const typedA = a;
    const typedB = b;
    if (typedA.length !== typedB.length) return false;
    for (let i = 0; i < typedA.length; i++) {
      if (typedA[i] !== typedB[i]) return false;
    }
    return true;
  }
  if (isTemporal(a) && isTemporal(b)) {
    const aTag = getStringTag(a);
    const bTag = getStringTag(b);
    if (aTag !== bTag) return false;
    if (typeof a.equals === `function`) {
      return a.equals(b);
    }
    return a.toString() === b.toString();
  }
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    if (visited.has(a)) {
      return visited.get(a) === b;
    }
    visited.set(a, b);
    const result = a.every(
      (item, index) => deepEqualsInternal(item, b[index], visited)
    );
    visited.delete(a);
    return result;
  }
  if (typeof a === `object`) {
    if (visited.has(a)) {
      return visited.get(a) === b;
    }
    visited.set(a, b);
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) {
      visited.delete(a);
      return false;
    }
    const result = keysA.every(
      (key) => key in b && deepEqualsInternal(a[key], b[key], visited)
    );
    visited.delete(a);
    return result;
  }
  return false;
}
const temporalTypes = [
  `Temporal.Duration`,
  `Temporal.Instant`,
  `Temporal.PlainDate`,
  `Temporal.PlainDateTime`,
  `Temporal.PlainMonthDay`,
  `Temporal.PlainTime`,
  `Temporal.PlainYearMonth`,
  `Temporal.ZonedDateTime`
];
function getStringTag(a) {
  return a[Symbol.toStringTag];
}
function isTemporal(a) {
  const tag = getStringTag(a);
  return typeof tag === `string` && temporalTypes.includes(tag);
}
const DEFAULT_COMPARE_OPTIONS = {
  direction: `asc`,
  nulls: `first`,
  stringSort: `locale`
};
export {
  DEFAULT_COMPARE_OPTIONS,
  deepEquals,
  isTemporal
};
//# sourceMappingURL=utils.js.map
