const objectIds = /* @__PURE__ */ new WeakMap();
let nextObjectId = 1;
function getObjectId(obj) {
  if (objectIds.has(obj)) {
    return objectIds.get(obj);
  }
  const id = nextObjectId++;
  objectIds.set(obj, id);
  return id;
}
const ascComparator = (a, b, opts) => {
  const { nulls } = opts;
  if (a == null && b == null) return 0;
  if (a == null) return nulls === `first` ? -1 : 1;
  if (b == null) return nulls === `first` ? 1 : -1;
  if (typeof a === `string` && typeof b === `string`) {
    if (opts.stringSort === `locale`) {
      return a.localeCompare(b, opts.locale, opts.localeOptions);
    }
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const result = ascComparator(a[i], b[i], opts);
      if (result !== 0) {
        return result;
      }
    }
    return a.length - b.length;
  }
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }
  const aIsObject = typeof a === `object`;
  const bIsObject = typeof b === `object`;
  if (aIsObject || bIsObject) {
    if (aIsObject && bIsObject) {
      const aId = getObjectId(a);
      const bId = getObjectId(b);
      return aId - bId;
    }
    if (aIsObject) return 1;
    if (bIsObject) return -1;
  }
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
};
const descComparator = (a, b, opts) => {
  return ascComparator(b, a, {
    ...opts,
    nulls: opts.nulls === `first` ? `last` : `first`
  });
};
function makeComparator(opts) {
  return (a, b) => {
    if (opts.direction === `asc`) {
      return ascComparator(a, b, opts);
    } else {
      return descComparator(a, b, opts);
    }
  };
}
const defaultComparator = makeComparator({
  direction: `asc`,
  nulls: `first`,
  stringSort: `locale`
});
function areUint8ArraysEqual(a, b) {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}
const UINT8ARRAY_NORMALIZE_THRESHOLD = 128;
function normalizeValue(value) {
  if (value instanceof Date) {
    return value.getTime();
  }
  const isUint8Array = typeof Buffer !== `undefined` && value instanceof Buffer || value instanceof Uint8Array;
  if (isUint8Array) {
    if (value.byteLength <= UINT8ARRAY_NORMALIZE_THRESHOLD) {
      return `__u8__${Array.from(value).join(`,`)}`;
    }
  }
  return value;
}
function areValuesEqual(a, b) {
  if (a === b) {
    return true;
  }
  const aIsUint8Array = typeof Buffer !== `undefined` && a instanceof Buffer || a instanceof Uint8Array;
  const bIsUint8Array = typeof Buffer !== `undefined` && b instanceof Buffer || b instanceof Uint8Array;
  if (aIsUint8Array && bIsUint8Array) {
    return areUint8ArraysEqual(a, b);
  }
  return false;
}
export {
  areValuesEqual,
  ascComparator,
  defaultComparator,
  descComparator,
  makeComparator,
  normalizeValue
};
//# sourceMappingURL=comparison.js.map
