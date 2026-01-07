"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const graph = require("../graph.cjs");
const d2 = require("../d2.cjs");
class NegateOperator extends graph.LinearUnaryOperator {
  inner(collection) {
    return collection.negate();
  }
}
function negate() {
  return (stream) => {
    const output = new d2.StreamBuilder(
      stream.graph,
      new graph.DifferenceStreamWriter()
    );
    const operator = new NegateOperator(
      stream.graph.getNextOperatorId(),
      stream.connectReader(),
      output.writer
    );
    stream.graph.addOperator(operator);
    return output;
  };
}
exports.NegateOperator = NegateOperator;
exports.negate = negate;
//# sourceMappingURL=negate.cjs.map
