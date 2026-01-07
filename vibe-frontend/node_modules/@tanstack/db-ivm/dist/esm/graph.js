import { MultiSet } from "./multiset.js";
class DifferenceStreamReader {
  #queue;
  constructor(queue) {
    this.#queue = queue;
  }
  drain() {
    const out = [...this.#queue].reverse();
    this.#queue.length = 0;
    return out;
  }
  isEmpty() {
    return this.#queue.length === 0;
  }
}
class DifferenceStreamWriter {
  #queues = [];
  sendData(collection) {
    if (!(collection instanceof MultiSet)) {
      collection = new MultiSet(collection);
    }
    for (const q of this.#queues) {
      q.unshift(collection);
    }
  }
  newReader() {
    const q = [];
    this.#queues.push(q);
    return new DifferenceStreamReader(q);
  }
}
class Operator {
  constructor(id, inputs, output) {
    this.id = id;
    this.inputs = inputs;
    this.output = output;
  }
  hasPendingWork() {
    return this.inputs.some((input) => !input.isEmpty());
  }
}
class UnaryOperator extends Operator {
  constructor(id, inputA, output) {
    super(id, [inputA], output);
    this.id = id;
  }
  inputMessages() {
    return this.inputs[0].drain();
  }
}
class BinaryOperator extends Operator {
  constructor(id, inputA, inputB, output) {
    super(id, [inputA, inputB], output);
    this.id = id;
  }
  inputAMessages() {
    return this.inputs[0].drain();
  }
  inputBMessages() {
    return this.inputs[1].drain();
  }
}
class LinearUnaryOperator extends UnaryOperator {
  run() {
    for (const message of this.inputMessages()) {
      this.output.sendData(this.inner(message));
    }
  }
}
export {
  BinaryOperator,
  DifferenceStreamReader,
  DifferenceStreamWriter,
  LinearUnaryOperator,
  Operator,
  UnaryOperator
};
//# sourceMappingURL=graph.js.map
