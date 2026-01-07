import { generateKeyBetween } from "fractional-indexing";
import { UnaryOperator, DifferenceStreamWriter } from "../graph.js";
import { StreamBuilder } from "../d2.js";
import { MultiSet } from "../multiset.js";
import { compareKeys, diffHalfOpen, binarySearch } from "../utils.js";
class TopKArray {
  #sortedValues = [];
  #comparator;
  #topKStart;
  #topKEnd;
  constructor(offset, limit, comparator) {
    this.#topKStart = offset;
    this.#topKEnd = offset + limit;
    this.#comparator = comparator;
  }
  get size() {
    const offset = this.#topKStart;
    const limit = this.#topKEnd - this.#topKStart;
    const available = this.#sortedValues.length - offset;
    return Math.max(0, Math.min(limit, available));
  }
  /**
   * Moves the topK window
   */
  move({
    offset,
    limit
  }) {
    const oldOffset = this.#topKStart;
    const oldLimit = this.#topKEnd - this.#topKStart;
    const oldRange = [
      this.#topKStart,
      this.#topKEnd === Infinity ? this.#topKStart + this.size : this.#topKEnd
    ];
    this.#topKStart = offset ?? oldOffset;
    this.#topKEnd = this.#topKStart + (limit ?? oldLimit);
    const newRange = [
      this.#topKStart,
      this.#topKEnd === Infinity ? Math.max(this.#topKStart + this.size, oldRange[1]) : this.#topKEnd
    ];
    const { onlyInA, onlyInB } = diffHalfOpen(oldRange, newRange);
    const moveIns = [];
    onlyInB.forEach((index) => {
      const value = this.#sortedValues[index];
      if (value) {
        moveIns.push(value);
      }
    });
    const moveOuts = [];
    onlyInA.forEach((index) => {
      const value = this.#sortedValues[index];
      if (value) {
        moveOuts.push(value);
      }
    });
    return { moveIns, moveOuts, changes: onlyInA.length + onlyInB.length > 0 };
  }
  insert(value) {
    const result = { moveIn: null, moveOut: null };
    const index = this.#findIndex(value);
    const indexBefore = index === 0 ? null : getIndex(this.#sortedValues[index - 1]);
    const indexAfter = index === this.#sortedValues.length ? null : getIndex(this.#sortedValues[index]);
    const fractionalIndex = generateKeyBetween(indexBefore, indexAfter);
    const val = indexedValue(value, fractionalIndex);
    this.#sortedValues.splice(index, 0, val);
    if (index < this.#topKEnd) {
      const moveInIndex = Math.max(index, this.#topKStart);
      if (moveInIndex < this.#sortedValues.length) {
        result.moveIn = this.#sortedValues[moveInIndex];
        if (this.#topKEnd < this.#sortedValues.length) {
          result.moveOut = this.#sortedValues[this.#topKEnd];
        }
      }
    }
    return result;
  }
  /**
   * Deletes a value that may or may not be in the topK.
   * IMPORTANT: this assumes that the value is present in the collection
   *            if it's not the case it will remove the element
   *            that is on the position where the provided `value` would be.
   */
  delete(value) {
    const result = { moveIn: null, moveOut: null };
    const index = this.#findIndex(value);
    const [removedElem] = this.#sortedValues.splice(index, 1);
    if (index < this.#topKEnd) {
      result.moveOut = removedElem;
      if (index < this.#topKStart) {
        const moveOutIndex = this.#topKStart - 1;
        if (moveOutIndex < this.#sortedValues.length) {
          result.moveOut = this.#sortedValues[moveOutIndex];
        } else {
          result.moveOut = null;
        }
      }
      const moveInIndex = this.#topKEnd - 1;
      if (moveInIndex < this.#sortedValues.length) {
        result.moveIn = this.#sortedValues[moveInIndex];
      }
    }
    return result;
  }
  // TODO: see if there is a way to refactor the code for insert and delete in the topK above
  //       because they are very similar, one is shifting the topK window to the left and the other is shifting it to the right
  //       so i have the feeling there is a common pattern here and we can implement both cases using that pattern
  #findIndex(value) {
    return binarySearch(
      this.#sortedValues,
      indexedValue(value, ``),
      (a, b) => this.#comparator(getValue(a), getValue(b))
    );
  }
}
class TopKWithFractionalIndexOperator extends UnaryOperator {
  #index = /* @__PURE__ */ new Map();
  // maps keys to their multiplicity
  /**
   * topK data structure that supports insertions and deletions
   * and returns changes to the topK.
   * Elements are stored as [key, value] tuples for stable tie-breaking.
   */
  #topK;
  constructor(id, inputA, output, comparator, options) {
    super(id, inputA, output);
    const limit = options.limit ?? Infinity;
    const offset = options.offset ?? 0;
    this.#topK = this.createTopK(
      offset,
      limit,
      createKeyedComparator(comparator)
    );
    options.setSizeCallback?.(() => this.#topK.size);
    options.setWindowFn?.(this.moveTopK.bind(this));
  }
  createTopK(offset, limit, comparator) {
    return new TopKArray(offset, limit, comparator);
  }
  /**
   * Moves the topK window based on the provided offset and limit.
   * Any changes to the topK are sent to the output.
   */
  moveTopK({ offset, limit }) {
    if (!(this.#topK instanceof TopKArray)) {
      throw new Error(
        `Cannot move B+-tree implementation of TopK with fractional index`
      );
    }
    const result = [];
    const diff = this.#topK.move({ offset, limit });
    diff.moveIns.forEach((moveIn) => this.handleMoveIn(moveIn, result));
    diff.moveOuts.forEach((moveOut) => this.handleMoveOut(moveOut, result));
    if (diff.changes) {
      this.output.sendData(new MultiSet(result));
    }
  }
  run() {
    const result = [];
    for (const message of this.inputMessages()) {
      for (const [item, multiplicity] of message.getInner()) {
        const [key, value] = item;
        this.processElement(key, value, multiplicity, result);
      }
    }
    if (result.length > 0) {
      this.output.sendData(new MultiSet(result));
    }
  }
  processElement(key, value, multiplicity, result) {
    const { oldMultiplicity, newMultiplicity } = this.addKey(key, multiplicity);
    let res = {
      moveIn: null,
      moveOut: null
    };
    if (oldMultiplicity <= 0 && newMultiplicity > 0) {
      res = this.#topK.insert([key, value]);
    } else if (oldMultiplicity > 0 && newMultiplicity <= 0) {
      res = this.#topK.delete([key, value]);
    } else ;
    this.handleMoveIn(res.moveIn, result);
    this.handleMoveOut(res.moveOut, result);
    return;
  }
  handleMoveIn(moveIn, result) {
    if (moveIn) {
      const [[key, value], index] = moveIn;
      result.push([[key, [value, index]], 1]);
    }
  }
  handleMoveOut(moveOut, result) {
    if (moveOut) {
      const [[key, value], index] = moveOut;
      result.push([[key, [value, index]], -1]);
    }
  }
  getMultiplicity(key) {
    return this.#index.get(key) ?? 0;
  }
  addKey(key, multiplicity) {
    const oldMultiplicity = this.getMultiplicity(key);
    const newMultiplicity = oldMultiplicity + multiplicity;
    if (newMultiplicity === 0) {
      this.#index.delete(key);
    } else {
      this.#index.set(key, newMultiplicity);
    }
    return { oldMultiplicity, newMultiplicity };
  }
}
function topKWithFractionalIndex(comparator, options) {
  const opts = options || {};
  return (stream) => {
    const output = new StreamBuilder(
      stream.graph,
      new DifferenceStreamWriter()
    );
    const operator = new TopKWithFractionalIndexOperator(
      stream.graph.getNextOperatorId(),
      stream.connectReader(),
      output.writer,
      comparator,
      opts
    );
    stream.graph.addOperator(operator);
    return output;
  };
}
function indexedValue(value, index) {
  return [value, index];
}
function getValue(indexedVal) {
  return indexedVal[0];
}
function getIndex(indexedVal) {
  return indexedVal[1];
}
function createKeyedComparator(comparator) {
  return ([aKey, aVal], [bKey, bVal]) => {
    const valueComparison = comparator(aVal, bVal);
    if (valueComparison !== 0) {
      return valueComparison;
    }
    return compareKeys(aKey, bKey);
  };
}
export {
  TopKWithFractionalIndexOperator,
  getIndex,
  getValue,
  indexedValue,
  topKWithFractionalIndex
};
//# sourceMappingURL=topKWithFractionalIndex.js.map
