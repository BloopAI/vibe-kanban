"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const graph = require("../graph.cjs");
const d2 = require("../d2.cjs");
const multiset = require("../multiset.cjs");
class ConsolidateOperator extends graph.UnaryOperator {
  run() {
    const messages = this.inputMessages();
    if (messages.length === 0) {
      return;
    }
    const combined = new multiset.MultiSet();
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
    const output = new d2.StreamBuilder(
      stream.graph,
      new graph.DifferenceStreamWriter()
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
exports.ConsolidateOperator = ConsolidateOperator;
exports.consolidate = consolidate;
//# sourceMappingURL=consolidate.cjs.map
