import { LinearUnaryOperator, DifferenceStreamWriter } from "../graph.js";
import { StreamBuilder } from "../d2.js";
class NegateOperator extends LinearUnaryOperator {
  inner(collection) {
    return collection.negate();
  }
}
function negate() {
  return (stream) => {
    const output = new StreamBuilder(
      stream.graph,
      new DifferenceStreamWriter()
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
export {
  NegateOperator,
  negate
};
//# sourceMappingURL=negate.js.map
