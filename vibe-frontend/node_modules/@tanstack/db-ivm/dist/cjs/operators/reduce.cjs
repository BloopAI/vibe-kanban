"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const graph = require("../graph.cjs");
const d2 = require("../d2.cjs");
const multiset = require("../multiset.cjs");
const indexes = require("../indexes.cjs");
class ReduceOperator extends graph.UnaryOperator {
  #index = new indexes.Index();
  #indexOut = new indexes.Index();
  #f;
  constructor(id, inputA, output, f) {
    super(id, inputA, output);
    this.#f = f;
  }
  run() {
    const keysTodo = /* @__PURE__ */ new Set();
    for (const message of this.inputMessages()) {
      for (const [item, multiplicity] of message.getInner()) {
        const [key, value] = item;
        this.#index.addValue(key, [value, multiplicity]);
        keysTodo.add(key);
      }
    }
    const result = [];
    for (const key of keysTodo) {
      const curr = this.#index.get(key);
      const currOut = this.#indexOut.get(key);
      const out = this.#f(curr);
      const newOutputMap = /* @__PURE__ */ new Map();
      const oldOutputMap = /* @__PURE__ */ new Map();
      for (const [value, multiplicity] of out) {
        const existing = newOutputMap.get(value) ?? 0;
        newOutputMap.set(value, existing + multiplicity);
      }
      for (const [value, multiplicity] of currOut) {
        const existing = oldOutputMap.get(value) ?? 0;
        oldOutputMap.set(value, existing + multiplicity);
      }
      for (const [value, multiplicity] of oldOutputMap) {
        if (!newOutputMap.has(value)) {
          result.push([[key, value], -multiplicity]);
          this.#indexOut.addValue(key, [value, -multiplicity]);
        }
      }
      for (const [value, multiplicity] of newOutputMap) {
        if (!oldOutputMap.has(value)) {
          if (multiplicity !== 0) {
            result.push([[key, value], multiplicity]);
            this.#indexOut.addValue(key, [value, multiplicity]);
          }
        }
      }
      for (const [value, newMultiplicity] of newOutputMap) {
        const oldMultiplicity = oldOutputMap.get(value);
        if (oldMultiplicity !== void 0) {
          const delta = newMultiplicity - oldMultiplicity;
          if (delta !== 0) {
            result.push([[key, value], delta]);
            this.#indexOut.addValue(key, [value, delta]);
          }
        }
      }
    }
    if (result.length > 0) {
      this.output.sendData(new multiset.MultiSet(result));
    }
  }
}
function reduce(f) {
  return (stream) => {
    const output = new d2.StreamBuilder(
      stream.graph,
      new graph.DifferenceStreamWriter()
    );
    const operator = new ReduceOperator(
      stream.graph.getNextOperatorId(),
      stream.connectReader(),
      output.writer,
      f
    );
    stream.graph.addOperator(operator);
    return output;
  };
}
exports.ReduceOperator = ReduceOperator;
exports.reduce = reduce;
//# sourceMappingURL=reduce.cjs.map
