import { LinearUnaryOperator, DifferenceStreamWriter } from "../graph.js";
import { StreamBuilder } from "../d2.js";
class TapOperator extends LinearUnaryOperator {
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
    const output = new StreamBuilder(
      stream.graph,
      new DifferenceStreamWriter()
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
export {
  TapOperator,
  tap
};
//# sourceMappingURL=tap.js.map
