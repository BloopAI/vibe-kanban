import { LinearUnaryOperator, DifferenceStreamWriter } from "../graph.js";
import { StreamBuilder } from "../d2.js";
class FilterOperator extends LinearUnaryOperator {
  #f;
  constructor(id, inputA, output, f) {
    super(id, inputA, output);
    this.#f = f;
  }
  inner(collection) {
    return collection.filter(this.#f);
  }
}
function filter(f) {
  return (stream) => {
    const output = new StreamBuilder(
      stream.graph,
      new DifferenceStreamWriter()
    );
    const operator = new FilterOperator(
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
  FilterOperator,
  filter
};
//# sourceMappingURL=filter.js.map
