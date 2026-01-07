"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const graph = require("../graph.cjs");
const d2 = require("../d2.cjs");
class TapOperator extends graph.LinearUnaryOperator {
  #f;
  constructor(id, inputA, output, f) {
    super(id, inputA, output);
    this.#f = f;
  }
  inner(collection) {
    this.#f(collection);
    return collection;
  }
}
function tap(f) {
  return (stream) => {
    const output = new d2.StreamBuilder(
      stream.graph,
      new graph.DifferenceStreamWriter()
    );
    const operator = new TapOperator(
      stream.graph.getNextOperatorId(),
      stream.connectReader(),
      output.writer,
      f
    );
    stream.graph.addOperator(operator);
    return output;
  };
}
exports.TapOperator = TapOperator;
exports.tap = tap;
//# sourceMappingURL=tap.cjs.map
