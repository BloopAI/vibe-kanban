import { DifferenceStreamWriter } from "../graph.js";
import { StreamBuilder } from "../d2.js";
import { ReduceOperator } from "./reduce.js";
class CountOperator extends ReduceOperator {
  constructor(id, inputA, output) {
    const countInner = (vals) => {
      let totalCount = 0;
      for (const [_, diff] of vals) {
        totalCount += diff;
      }
      return [[totalCount, 1]];
    };
    super(id, inputA, output, countInner);
  }
}
function count() {
  return (stream) => {
    const output = new StreamBuilder(
      stream.graph,
      new DifferenceStreamWriter()
    );
    const operator = new CountOperator(
      stream.graph.getNextOperatorId(),
      stream.connectReader(),
      output.writer
    );
    stream.graph.addOperator(operator);
    return output;
  };
}
export {
  CountOperator,
  count
};
//# sourceMappingURL=count.js.map
