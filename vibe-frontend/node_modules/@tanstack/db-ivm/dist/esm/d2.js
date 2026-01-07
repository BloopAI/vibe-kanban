import { DifferenceStreamWriter } from "./graph.js";
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
    const writer = new DifferenceStreamWriter();
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
  constructor(graph, writer) {
    this.#graph = graph;
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
export {
  D2,
  RootStreamBuilder,
  StreamBuilder
};
//# sourceMappingURL=d2.js.map
