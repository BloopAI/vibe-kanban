import { BinaryOperator, DifferenceStreamWriter } from "../graph.js";
import { StreamBuilder } from "../d2.js";
class ConcatOperator extends BinaryOperator {
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
    const output = new StreamBuilder(
      stream.graph,
      new DifferenceStreamWriter()
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
export {
  ConcatOperator,
  concat
};
//# sourceMappingURL=concat.js.map
