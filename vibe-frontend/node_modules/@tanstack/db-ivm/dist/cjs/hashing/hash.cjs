"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const murmur = require("./murmur.cjs");
const TRUE = murmur.randomHash();
const FALSE = murmur.randomHash();
const NULL = murmur.randomHash();
const UNDEFINED = murmur.randomHash();
const KEY = murmur.randomHash();
const FUNCTIONS = murmur.randomHash();
const DATE_MARKER = murmur.randomHash();
const OBJECT_MARKER = murmur.randomHash();
const ARRAY_MARKER = murmur.randomHash();
const MAP_MARKER = murmur.randomHash();
const SET_MARKER = murmur.randomHash();
const UINT8ARRAY_MARKER = murmur.randomHash();
const UINT8ARRAY_CONTENT_HASH_THRESHOLD = 128;
const hashCache = /* @__PURE__ */ new WeakMap();
function hash(input) {
  const hasher = new murmur.MurmurHashStream();
  updateHasher(hasher, input);
  return hasher.digest();
}
function hashObject(input) {
  const cachedHash = hashCache.get(input);
  if (cachedHash !== void 0) {
    return cachedHash;
  }
  let valueHash;
  if (input instanceof Date) {
    valueHash = hashDate(input);
  } else if (
    // Check if input is a Uint8Array or Buffer
    typeof Buffer !== `undefined` && input instanceof Buffer || input instanceof Uint8Array
  ) {
    if (input.byteLength <= UINT8ARRAY_CONTENT_HASH_THRESHOLD) {
      valueHash = hashUint8Array(input);
    } else {
      return cachedReferenceHash(input);
    }
  } else if (input instanceof File) {
    return cachedReferenceHash(input);
  } else {
    let plainObjectInput = input;
    let marker = OBJECT_MARKER;
    if (input instanceof Array) {
      marker = ARRAY_MARKER;
    }
    if (input instanceof Map) {
      marker = MAP_MARKER;
      plainObjectInput = [...input.entries()];
    }
    if (input instanceof Set) {
      marker = SET_MARKER;
      plainObjectInput = [...input.entries()];
    }
    valueHash = hashPlainObject(plainObjectInput, marker);
  }
  hashCache.set(input, valueHash);
  return valueHash;
}
function hashDate(input) {
  const hasher = new murmur.MurmurHashStream();
  hasher.update(DATE_MARKER);
  hasher.update(input.getTime());
  return hasher.digest();
}
function hashUint8Array(input) {
  const hasher = new murmur.MurmurHashStream();
  hasher.update(UINT8ARRAY_MARKER);
  hasher.update(input.byteLength);
  for (let i = 0; i < input.byteLength; i++) {
    hasher.writeByte(input[i]);
  }
  return hasher.digest();
}
function hashPlainObject(input, marker) {
  const hasher = new murmur.MurmurHashStream();
  hasher.update(marker);
  const keys = Object.keys(input);
  keys.sort(keySort);
  for (const key of keys) {
    hasher.update(KEY);
    hasher.update(key);
    updateHasher(hasher, input[key]);
  }
  return hasher.digest();
}
function updateHasher(hasher, input) {
  if (input === null) {
    hasher.update(NULL);
    return;
  }
  switch (typeof input) {
    case `undefined`:
      hasher.update(UNDEFINED);
      return;
    case `boolean`:
      hasher.update(input ? TRUE : FALSE);
      return;
    case `number`:
      hasher.update(isNaN(input) ? NaN : input === 0 ? 0 : input);
      return;
    case `bigint`:
    case `string`:
    case `symbol`:
      hasher.update(input);
      return;
    case `object`:
      hasher.update(getCachedHash(input));
      return;
    case `function`:
      hasher.update(cachedReferenceHash(input));
      return;
    default:
      console.warn(
        `Ignored input during hashing because it is of type ${typeof input} which is not supported`
      );
  }
}
function getCachedHash(input) {
  let valueHash = hashCache.get(input);
  if (valueHash === void 0) {
    valueHash = hashObject(input);
  }
  return valueHash;
}
let nextRefId = 1;
function cachedReferenceHash(fn) {
  let valueHash = hashCache.get(fn);
  if (valueHash === void 0) {
    valueHash = nextRefId ^ FUNCTIONS;
    nextRefId++;
    hashCache.set(fn, valueHash);
  }
  return valueHash;
}
function keySort(a, b) {
  return a.localeCompare(b);
}
exports.hash = hash;
//# sourceMappingURL=hash.cjs.map
