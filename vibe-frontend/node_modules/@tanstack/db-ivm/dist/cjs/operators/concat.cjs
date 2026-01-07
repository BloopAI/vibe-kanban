"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const graph = require("../graph.cjs");
const d2 = require("../d2.cjs");
class ConcatOperator extends graph.BinaryOperator {
  run() {
    for (const message of this.inputAMessages()) {
      this.output.sendData(message);
    }
    for (const message of this.inputBMessages()) {
      this.output.sendData(message);
    }
  }
}
function concat(other) {
  return (stream) => {
    if (stream.graph !== other.graph) {
      throw new Error(`Cannot concat streams from different graphs`);
    }
    const output = new d2.StreamBuilder(
      stream.graph,
      new graph.DifferenceStreamWriter()
    );
    const operator = new ConcatOperator(
      stream.graph.getNextOperatorId(),
      stream.connectReader(),
      other.connectReader(),
      output.writer
    );
    stream.graph.addOperator(operator);
    return output;
  };
}
exports.ConcatOperator = ConcatOperator;
exports.concat = concat;
//# sourceMappingURL=concat.cjs.map
