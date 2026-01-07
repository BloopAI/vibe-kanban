import { UnaryOperator, DifferenceStreamWriter } from "../graph.js";
import { StreamBuilder } from "../d2.js";
import { MultiSet } from "../multiset.js";
import { hash } from "../hashing/hash.js";
class DistinctOperator extends UnaryOperator {
  #by;
  #values;
  // keeps track of the number of times each value has been seen
  constructor(id, input, output, by = (value) => value) {
    super(id, input, output);
    this.#by = by;
    this.#values = /* @__PURE__ */ new Map();
  }
  run() {
    const updatedValues = /* @__PURE__ */ new Map();
    for (const message of this.inputMessages()) {
      for (const [value, diff] of message.getInner()) {
        const hashedValue = hash(this.#by(value));
        const oldMultiplicity = updatedValues.get(hashedValue)?.[0] ?? this.#values.get(hashedValue) ?? 0;
        const newMultiplicity = oldMultiplicity + diff;
        updatedValues.set(hashedValue, [newMultiplicity, value]);
      }
    }
    const result = [];
    for (const [
      hashedValue,
      [newMultiplicity, value]
    ] of updatedValues.entries()) {
      const oldMultiplicity = this.#values.get(hashedValue) ?? 0;
      if (newMultiplicity === 0) {
        this.#values.delete(hashedValue);
      } else {
        this.#values.set(hashedValue, newMultiplicity);
      }
      if (oldMultiplicity <= 0 && newMultiplicity > 0) {
        result.push([[hash(this.#by(value)), value[1]], 1]);
      } else if (oldMultiplicity > 0 && newMultiplicity <= 0) {
        result.push([[hash(this.#by(value)), value[1]], -1]);
      }
    }
    if (result.length > 0) {
      this.output.sendData(new MultiSet(result));
    }
  }
}
function distinct(by = (value) => value) {
  return (stream) => {
    const output = new StreamBuilder(
      stream.graph,
      new DifferenceStreamWriter()
    );
    const operator = new DistinctOperator(
      stream.graph.getNextOperatorId(),
      stream.connectReader(),
      output.writer,
      by
    );
    stream.graph.addOperator(operator);
    return output;
  };
}
export {
  DistinctOperator,
  distinct
};
//# sourceMappingURL=distinct.js.map
