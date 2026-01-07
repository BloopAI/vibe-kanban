"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const graph = require("../graph.cjs");
const d2 = require("../d2.cjs");
const multiset = require("../multiset.cjs");
const hash = require("../hashing/hash.cjs");
class DistinctOperator extends graph.UnaryOperator {
  #by;
  #values;
  // keeps track of the number of times each value has been seen
  constructor(id, input, output, by = (value) => value) {
    super(id, input, output);
    this.#by = by;
    this.#values = /* @__PURE__ */ new Map();
  }
  run() {
    const updatedValues = /* @__PURE__ */ new Map();
    for (const message of this.inputMessages()) {
      for (const [value, diff] of message.getInner()) {
        const hashedValue = hash.hash(this.#by(value));
        const oldMultiplicity = updatedValues.get(hashedValue)?.[0] ?? this.#values.get(hashedValue) ?? 0;
        const newMultiplicity = oldMultiplicity + diff;
        updatedValues.set(hashedValue, [newMultiplicity, value]);
      }
    }
    const result = [];
    for (const [
      hashedValue,
      [newMultiplicity, value]
    ] of updatedValues.entries()) {
      const oldMultiplicity = this.#values.get(hashedValue) ?? 0;
      if (newMultiplicity === 0) {
        this.#values.delete(hashedValue);
      } else {
        this.#values.set(hashedValue, newMultiplicity);
      }
      if (oldMultiplicity <= 0 && newMultiplicity > 0) {
        result.push([[hash.hash(this.#by(value)), value[1]], 1]);
      } else if (oldMultiplicity > 0 && newMultiplicity <= 0) {
        result.push([[hash.hash(this.#by(value)), value[1]], -1]);
      }
    }
    if (result.length > 0) {
      this.output.sendData(new multiset.MultiSet(result));
    }
  }
}
function distinct(by = (value) => value) {
  return (stream) => {
    const output = new d2.StreamBuilder(
      stream.graph,
      new graph.DifferenceStreamWriter()
    );
    const operator = new DistinctOperator(
      stream.graph.getNextOperatorId(),
      stream.connectReader(),
      output.writer,
      by
    );
    stream.graph.addOperator(operator);
    return output;
  };
}
exports.DistinctOperator = DistinctOperator;
exports.distinct = distinct;
//# sourceMappingURL=distinct.cjs.map
