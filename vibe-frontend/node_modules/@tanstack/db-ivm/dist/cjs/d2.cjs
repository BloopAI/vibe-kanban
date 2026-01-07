"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const graph = require("./graph.cjs");
class D2 {
  #operators = [];
  #nextOperatorId = 0;
  #finalized = false;
  constructor() {
  }
  #checkNotFinalized() {
    if (this.#finalized) {
      throw new Error(`Graph already finalized`);
    }
  }
  getNextOperatorId() {
    this.#checkNotFinalized();
    return this.#nextOperatorId++;
  }
  newInput() {
    this.#checkNotFinalized();
    const writer = new graph.DifferenceStreamWriter();
    const streamBuilder = new RootStreamBuilder(this, writer);
    return streamBuilder;
  }
  addOperator(operator) {
    this.#checkNotFinalized();
    this.#operators.push(operator);
  }
  finalize() {
    this.#checkNotFinalized();
    this.#finalized = true;
  }
  step() {
    if (!this.#finalized) {
      throw new Error(`Graph not finalized`);
    }
    for (const op of this.#operators) {
      op.run();
    }
  }
  pendingWork() {
    return this.#operators.some((op) => op.hasPendingWork());
  }
  run() {
    while (this.pendingWork()) {
      this.step();
    }
  }
}
class StreamBuilder {
  #graph;
  #writer;
  constructor(graph2, writer) {
    this.#graph = graph2;
    this.#writer = writer;
  }
  connectReader() {
    return this.#writer.newReader();
  }
  get writer() {
    return this.#writer;
  }
  get graph() {
    return this.#graph;
  }
  pipe(...operators) {
    return operators.reduce((stream, operator) => {
      return operator(stream);
    }, this);
  }
}
class RootStreamBuilder extends StreamBuilder {
  sendData(collection) {
    this.writer.sendData(collection);
  }
}
exports.D2 = D2;
exports.RootStreamBuilder = RootStreamBuilder;
exports.StreamBuilder = StreamBuilder;
//# sourceMappingURL=d2.cjs.map
