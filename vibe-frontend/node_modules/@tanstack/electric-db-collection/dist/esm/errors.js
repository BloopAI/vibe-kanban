import { TanStackDBError } from "@tanstack/db";
class ElectricDBCollectionError extends TanStackDBError {
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
export {
  ElectricDBCollectionError,
  ExpectedNumberInAwaitTxIdError,
  StreamAbortedError,
  TimeoutWaitingForMatchError,
  TimeoutWaitingForTxIdError
};
//# sourceMappingURL=errors.js.map
