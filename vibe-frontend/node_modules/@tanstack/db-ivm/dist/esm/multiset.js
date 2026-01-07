import { chunkedArrayPush, globalObjectIdGenerator, DefaultMap } from "./utils.js";
import { hash } from "./hashing/hash.js";
class MultiSet {
  #inner;
  constructor(data = []) {
    this.#inner = data;
  }
  toString(indent = false) {
    return `MultiSet(${JSON.stringify(this.#inner, null, indent ? 2 : void 0)})`;
  }
  toJSON() {
    return JSON.stringify(Array.from(this.getInner()));
  }
  static fromJSON(json) {
    return new MultiSet(JSON.parse(json));
  }
  /**
   * Apply a function to all records in the collection.
   */
  map(f) {
    return new MultiSet(
      this.#inner.map(([data, multiplicity]) => [f(data), multiplicity])
    );
  }
  /**
   * Filter out records for which a function f(record) evaluates to False.
   */
  filter(f) {
    return new MultiSet(this.#inner.filter(([data, _]) => f(data)));
  }
  /**
   * Negate all multiplicities in the collection.
   */
  negate() {
    return new MultiSet(
      this.#inner.map(([data, multiplicity]) => [data, -multiplicity])
    );
  }
  /**
   * Concatenate two collections together.
   */
  concat(other) {
    const out = [];
    chunkedArrayPush(out, this.#inner);
    chunkedArrayPush(out, other.getInner());
    return new MultiSet(out);
  }
  /**
   * Produce as output a collection that is logically equivalent to the input
   * but which combines identical instances of the same record into one
   * (record, multiplicity) pair.
   */
  consolidate() {
    if (this.#inner.length > 0) {
      const firstItem = this.#inner[0]?.[0];
      if (Array.isArray(firstItem) && firstItem.length === 2) {
        return this.#consolidateKeyed();
      }
    }
    return this.#consolidateUnkeyed();
  }
  /**
   * Private method for consolidating keyed multisets where keys are strings/numbers
   * and values are compared by reference equality.
   *
   * This method provides significant performance improvements over the hash-based approach
   * by using WeakMap for object reference tracking and avoiding expensive serialization.
   *
   * Special handling for join operations: When values are tuples of length 2 (common in joins),
   * we unpack them and compare each element individually to maintain proper equality semantics.
   */
  #consolidateKeyed() {
    const consolidated = /* @__PURE__ */ new Map();
    const values = /* @__PURE__ */ new Map();
    const getTupleId = (tuple) => {
      if (tuple.length !== 2) {
        throw new Error(`Expected tuple of length 2`);
      }
      const [first, second] = tuple;
      return `${globalObjectIdGenerator.getStringId(first)}|${globalObjectIdGenerator.getStringId(second)}`;
    };
    for (const [data, multiplicity] of this.#inner) {
      if (!Array.isArray(data) || data.length !== 2) {
        return this.#consolidateUnkeyed();
      }
      const [key, value] = data;
      if (typeof key !== `string` && typeof key !== `number`) {
        return this.#consolidateUnkeyed();
      }
      let valueId;
      if (Array.isArray(value) && value.length === 2) {
        valueId = getTupleId(value);
      } else {
        valueId = globalObjectIdGenerator.getStringId(value);
      }
      const compositeKey = key + `|` + valueId;
      consolidated.set(
        compositeKey,
        (consolidated.get(compositeKey) || 0) + multiplicity
      );
      if (!values.has(compositeKey)) {
        values.set(compositeKey, data);
      }
    }
    const result = [];
    for (const [compositeKey, multiplicity] of consolidated) {
      if (multiplicity !== 0) {
        result.push([values.get(compositeKey), multiplicity]);
      }
    }
    return new MultiSet(result);
  }
  /**
   * Private method for consolidating unkeyed multisets using the original approach.
   */
  #consolidateUnkeyed() {
    const consolidated = new DefaultMap(() => 0);
    const values = /* @__PURE__ */ new Map();
    let hasString = false;
    let hasNumber = false;
    let hasOther = false;
    for (const [data, _] of this.#inner) {
      if (typeof data === `string`) {
        hasString = true;
      } else if (typeof data === `number`) {
        hasNumber = true;
      } else {
        hasOther = true;
        break;
      }
    }
    const requireJson = hasOther || hasString && hasNumber;
    for (const [data, multiplicity] of this.#inner) {
      const key = requireJson ? hash(data) : data;
      if (requireJson && !values.has(key)) {
        values.set(key, data);
      }
      consolidated.update(key, (count) => count + multiplicity);
    }
    const result = [];
    for (const [key, multiplicity] of consolidated.entries()) {
      if (multiplicity !== 0) {
        const parsedKey = requireJson ? values.get(key) : key;
        result.push([parsedKey, multiplicity]);
      }
    }
    return new MultiSet(result);
  }
  extend(other) {
    const otherArray = other instanceof MultiSet ? other.getInner() : other;
    chunkedArrayPush(this.#inner, otherArray);
  }
  add(item, multiplicity) {
    if (multiplicity !== 0) {
      this.#inner.push([item, multiplicity]);
    }
  }
  getInner() {
    return this.#inner;
  }
}
export {
  MultiSet
};
//# sourceMappingURL=multiset.js.map
