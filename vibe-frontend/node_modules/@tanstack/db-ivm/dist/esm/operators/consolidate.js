import { UnaryOperator, DifferenceStreamWriter } from "../graph.js";
import { StreamBuilder } from "../d2.js";
import { MultiSet } from "../multiset.js";
class ConsolidateOperator extends UnaryOperator {
  run() {
    const messages = this.inputMessages();
    if (messages.length === 0) {
      return;
    }
    const combined = new MultiSet();
    for (const message of messages) {
      combined.extend(message);
    }
    const consolidated = combined.consolidate();
    if (consolidated.getInner().length > 0) {
      this.output.sendData(consolidated);
    }
  }
}
function consolidate() {
  return (stream) => {
    const output = new StreamBuilder(
      stream.graph,
      new DifferenceStreamWriter()
    );
    const operator = new ConsolidateOperator(
      stream.graph.getNextOperatorId(),
      stream.connectReader(),
      output.writer
    );
    stream.graph.addOperator(operator);
    return output;
  };
}
export {
  ConsolidateOperator,
  consolidate
};
//# sourceMappingURL=consolidate.js.map
