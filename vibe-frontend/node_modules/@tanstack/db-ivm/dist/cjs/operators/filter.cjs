"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const graph = require("../graph.cjs");
const d2 = require("../d2.cjs");
class FilterOperator extends graph.LinearUnaryOperator {
  #f;
  constructor(id, inputA, output, f) {
    super(id, inputA, output);
    this.#f = f;
  }
  inner(collection) {
    return collection.filter(this.#f);
  }
}
function filter(f) {
  return (stream) => {
    const output = new d2.StreamBuilder(
      stream.graph,
      new graph.DifferenceStreamWriter()
    );
    const operator = new FilterOperator(
      stream.graph.getNextOperatorId(),
      stream.connectReader(),
      output.writer,
      f
    );
    stream.graph.addOperator(operator);
    return output;
  };
}
exports.FilterOperator = FilterOperator;
exports.filter = filter;
//# sourceMappingURL=filter.cjs.map
