"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const db = require("@tanstack/db");
class ElectricDBCollectionError extends db.TanStackDBError {
  constructor(message, collectionId) {
    super(`${collectionId ? `[${collectionId}] ` : ``}${message}`);
    this.name = `ElectricDBCollectionError`;
  }
}
class ExpectedNumberInAwaitTxIdError extends ElectricDBCollectionError {
  constructor(txIdType, collectionId) {
    super(`Expected number in awaitTxId, received ${txIdType}`, collectionId);
    this.name = `ExpectedNumberInAwaitTxIdError`;
  }
}
class TimeoutWaitingForTxIdError extends ElectricDBCollectionError {
  constructor(txId, collectionId) {
    super(`Timeout waiting for txId: ${txId}`, collectionId);
    this.name = `TimeoutWaitingForTxIdError`;
  }
}
class TimeoutWaitingForMatchError extends ElectricDBCollectionError {
  constructor(collectionId) {
    super(`Timeout waiting for custom match function`, collectionId);
    this.name = `TimeoutWaitingForMatchError`;
  }
}
class StreamAbortedError extends ElectricDBCollectionError {
  constructor(collectionId) {
    super(`Stream aborted`, collectionId);
    this.name = `StreamAbortedError`;
  }
}
exports.ElectricDBCollectionError = ElectricDBCollectionError;
exports.ExpectedNumberInAwaitTxIdError = ExpectedNumberInAwaitTxIdError;
exports.StreamAbortedError = StreamAbortedError;
exports.TimeoutWaitingForMatchError = TimeoutWaitingForMatchError;
exports.TimeoutWaitingForTxIdError = TimeoutWaitingForTxIdError;
//# sourceMappingURL=errors.cjs.map
