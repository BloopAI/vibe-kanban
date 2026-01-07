import { UnaryOperator, DifferenceStreamWriter } from "../graph.js";
import { StreamBuilder } from "../d2.js";
class DebugOperator extends UnaryOperator {
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
    const output = new StreamBuilder(
      stream.graph,
      new DifferenceStreamWriter()
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
export {
  DebugOperator,
  debug
};
//# sourceMappingURL=debug.js.map
