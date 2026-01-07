import { TanStackDBError } from '@tanstack/db'

// Electric DB Collection Errors
export class ElectricDBCollectionError extends TanStackDBError {
  constructor(message: string, collectionId?: string) {
    super(`${collectionId ? `[${collectionId}] ` : ``}${message}`)
    this.name = `ElectricDBCollectionError`
  }
}

export class ExpectedNumberInAwaitTxIdError extends ElectricDBCollectionError {
  constructor(txIdType: string, collectionId?: string) {
    super(`Expected number in awaitTxId, received ${txIdType}`, collectionId)
    this.name = `ExpectedNumberInAwaitTxIdError`
  }
}

export class TimeoutWaitingForTxIdError extends ElectricDBCollectionError {
  constructor(txId: number, collectionId?: string) {
    super(`Timeout waiting for txId: ${txId}`, collectionId)
    this.name = `TimeoutWaitingForTxIdError`
  }
}

export class TimeoutWaitingForMatchError extends ElectricDBCollectionError {
  constructor(collectionId?: string) {
    super(`Timeout waiting for custom match function`, collectionId)
    this.name = `TimeoutWaitingForMatchError`
  }
}

export class StreamAbortedError extends ElectricDBCollectionError {
  constructor(collectionId?: string) {
    super(`Stream aborted`, collectionId)
    this.name = `StreamAbortedError`
  }
}
