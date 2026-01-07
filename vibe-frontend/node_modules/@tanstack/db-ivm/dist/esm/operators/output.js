import { UnaryOperator, DifferenceStreamWriter } from "../graph.js";
import { StreamBuilder } from "../d2.js";
class OutputOperator extends UnaryOperator {
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
    const outputStream = new StreamBuilder(
      stream.graph,
      new DifferenceStreamWriter()
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
export {
  OutputOperator,
  output
};
//# sourceMappingURL=output.js.map
