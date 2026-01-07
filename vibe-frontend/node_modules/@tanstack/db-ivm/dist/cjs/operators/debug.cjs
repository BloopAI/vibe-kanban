"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const graph = require("../graph.cjs");
const d2 = require("../d2.cjs");
class DebugOperator extends graph.UnaryOperator {
  #name;
  #indent;
  constructor(id, inputA, output, name, indent = false) {
    super(id, inputA, output);
    this.#name = name;
    this.#indent = indent;
  }
  run() {
    for (const message of this.inputMessages()) {
      console.log(`debug ${this.#name} data: ${message.toString(this.#indent)}`);
      this.output.sendData(message);
    }
  }
}
function debug(name, indent = false) {
  return (stream) => {
    const output = new d2.StreamBuilder(
      stream.graph,
      new graph.DifferenceStreamWriter()
    );
    const operator = new DebugOperator(
      stream.graph.getNextOperatorId(),
      stream.connectReader(),
      output.writer,
      name,
      indent
    );
    stream.graph.addOperator(operator);
    return output;
  };
}
exports.DebugOperator = DebugOperator;
exports.debug = debug;
//# sourceMappingURL=debug.cjs.map
