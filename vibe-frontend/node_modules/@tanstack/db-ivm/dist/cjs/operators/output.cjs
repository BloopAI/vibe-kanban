"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const graph = require("../graph.cjs");
const d2 = require("../d2.cjs");
class OutputOperator extends graph.UnaryOperator {
  #fn;
  constructor(id, inputA, outputWriter, fn) {
    super(id, inputA, outputWriter);
    this.#fn = fn;
  }
  run() {
    for (const message of this.inputMessages()) {
      this.#fn(message);
      this.output.sendData(message);
    }
  }
}
function output(fn) {
  return (stream) => {
    const outputStream = new d2.StreamBuilder(
      stream.graph,
      new graph.DifferenceStreamWriter()
    );
    const operator = new OutputOperator(
      stream.graph.getNextOperatorId(),
      stream.connectReader(),
      outputStream.writer,
      fn
    );
    stream.graph.addOperator(operator);
    return outputStream;
  };
}
exports.OutputOperator = OutputOperator;
exports.output = output;
//# sourceMappingURL=output.cjs.map
