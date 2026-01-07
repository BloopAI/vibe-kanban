"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const graph = require("../graph.cjs");
const d2 = require("../d2.cjs");
const multiset = require("../multiset.cjs");
const indexes = require("../indexes.cjs");
class JoinOperator extends graph.BinaryOperator {
  #indexA = new indexes.Index();
  #indexB = new indexes.Index();
  #mode;
  constructor(id, inputA, inputB, output, mode = `inner`) {
    super(id, inputA, inputB, output);
    this.#mode = mode;
  }
  run() {
    const deltaA = indexes.Index.fromMultiSets(
      this.inputAMessages()
    );
    const deltaB = indexes.Index.fromMultiSets(
      this.inputBMessages()
    );
    if (deltaA.size === 0 && deltaB.size === 0) return;
    const results = new multiset.MultiSet();
    if (this.#mode !== `anti`) {
      this.emitInnerResults(deltaA, deltaB, results);
    }
    if (this.#mode === `left` || this.#mode === `full` || this.#mode === `anti`) {
      this.emitLeftOuterResults(deltaA, deltaB, results);
    }
    if (this.#mode === `right` || this.#mode === `full`) {
      this.emitRightOuterResults(deltaA, deltaB, results);
    }
    this.#indexA.append(deltaA);
    this.#indexB.append(deltaB);
    if (results.getInner().length > 0) {
      this.output.sendData(results);
    }
  }
  emitInnerResults(deltaA, deltaB, results) {
    if (deltaA.size > 0) results.extend(deltaA.join(this.#indexB));
    if (deltaB.size > 0) results.extend(this.#indexA.join(deltaB));
    if (deltaA.size > 0 && deltaB.size > 0) results.extend(deltaA.join(deltaB));
  }
  emitLeftOuterResults(deltaA, deltaB, results) {
    if (deltaA.size > 0) {
      for (const [key, valueIterator] of deltaA.entriesIterators()) {
        const currentMultiplicityB = this.#indexB.getConsolidatedMultiplicity(key);
        const deltaMultiplicityB = deltaB.getConsolidatedMultiplicity(key);
        const finalMultiplicityB = currentMultiplicityB + deltaMultiplicityB;
        if (finalMultiplicityB === 0) {
          for (const [value, multiplicity] of valueIterator) {
            if (multiplicity !== 0) {
              results.add([key, [value, null]], multiplicity);
            }
          }
        }
      }
    }
    if (deltaB.size > 0) {
      for (const key of deltaB.getPresenceKeys()) {
        const before = this.#indexB.getConsolidatedMultiplicity(key);
        const deltaMult = deltaB.getConsolidatedMultiplicity(key);
        if (deltaMult === 0) continue;
        const after = before + deltaMult;
        if (before === 0 === (after === 0)) continue;
        const transitioningToMatched = before === 0;
        for (const [value, multiplicity] of this.#indexA.getIterator(key)) {
          if (multiplicity !== 0) {
            results.add(
              [key, [value, null]],
              transitioningToMatched ? -multiplicity : +multiplicity
            );
          }
        }
      }
    }
  }
  emitRightOuterResults(deltaA, deltaB, results) {
    if (deltaB.size > 0) {
      for (const [key, valueIterator] of deltaB.entriesIterators()) {
        const currentMultiplicityA = this.#indexA.getConsolidatedMultiplicity(key);
        const deltaMultiplicityA = deltaA.getConsolidatedMultiplicity(key);
        const finalMultiplicityA = currentMultiplicityA + deltaMultiplicityA;
        if (finalMultiplicityA === 0) {
          for (const [value, multiplicity] of valueIterator) {
            if (multiplicity !== 0) {
              results.add([key, [null, value]], multiplicity);
            }
          }
        }
      }
    }
    if (deltaA.size > 0) {
      for (const key of deltaA.getPresenceKeys()) {
        const before = this.#indexA.getConsolidatedMultiplicity(key);
        const deltaMult = deltaA.getConsolidatedMultiplicity(key);
        if (deltaMult === 0) continue;
        const after = before + deltaMult;
        if (before === 0 === (after === 0)) continue;
        const transitioningToMatched = before === 0;
        for (const [value, multiplicity] of this.#indexB.getIterator(key)) {
          if (multiplicity !== 0) {
            results.add(
              [key, [null, value]],
              transitioningToMatched ? -multiplicity : +multiplicity
            );
          }
        }
      }
    }
  }
}
function join(other, type = `inner`) {
  return (stream) => {
    if (stream.graph !== other.graph) {
      throw new Error(`Cannot join streams from different graphs`);
    }
    const output = new d2.StreamBuilder(
      stream.graph,
      new graph.DifferenceStreamWriter()
    );
    const operator = new JoinOperator(
      stream.graph.getNextOperatorId(),
      stream.connectReader(),
      other.connectReader(),
      output.writer,
      type
    );
    stream.graph.addOperator(operator);
    return output;
  };
}
function innerJoin(other) {
  return join(other, `inner`);
}
function antiJoin(other) {
  return join(other, `anti`);
}
function leftJoin(other) {
  return join(other, `left`);
}
function rightJoin(other) {
  return join(other, `right`);
}
function fullJoin(other) {
  return join(other, `full`);
}
exports.JoinOperator = JoinOperator;
exports.antiJoin = antiJoin;
exports.fullJoin = fullJoin;
exports.innerJoin = innerJoin;
exports.join = join;
exports.leftJoin = leftJoin;
exports.rightJoin = rightJoin;
//# sourceMappingURL=join.cjs.map
