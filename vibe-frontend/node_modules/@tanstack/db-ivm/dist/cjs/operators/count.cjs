"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const graph = require("../graph.cjs");
const d2 = require("../d2.cjs");
const reduce = require("./reduce.cjs");
class CountOperator extends reduce.ReduceOperator {
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
    const output = new d2.StreamBuilder(
      stream.graph,
      new graph.DifferenceStreamWriter()
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
exports.CountOperator = CountOperator;
exports.count = count;
//# sourceMappingURL=count.cjs.map
