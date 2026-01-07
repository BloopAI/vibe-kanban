import { TanStackDBError } from '@tanstack/db';
export declare class ElectricDBCollectionError extends TanStackDBError {
    constructor(message: string, collectionId?: string);
}
export declare class ExpectedNumberInAwaitTxIdError extends ElectricDBCollectionError {
    constructor(txIdType: string, collectionId?: string);
}
export declare class TimeoutWaitingForTxIdError extends ElectricDBCollectionError {
    constructor(txId: number, collectionId?: string);
}
export declare class TimeoutWaitingForMatchError extends ElectricDBCollectionError {
    constructor(collectionId?: string);
}
export declare class StreamAbortedError extends ElectricDBCollectionError {
    constructor(collectionId?: string);
}
