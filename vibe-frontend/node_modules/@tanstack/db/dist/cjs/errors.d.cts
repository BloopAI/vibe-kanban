export declare class TanStackDBError extends Error {
    constructor(message: string);
}
export declare class NonRetriableError extends TanStackDBError {
    constructor(message: string);
}
export declare class SchemaValidationError extends TanStackDBError {
    type: `insert` | `update`;
    issues: ReadonlyArray<{
        message: string;
        path?: ReadonlyArray<string | number | symbol>;
    }>;
    constructor(type: `insert` | `update`, issues: ReadonlyArray<{
        message: string;
        path?: ReadonlyArray<string | number | symbol>;
    }>, message?: string);
}
export declare class DuplicateDbInstanceError extends TanStackDBError {
    constructor();
}
export declare class CollectionConfigurationError extends TanStackDBError {
    constructor(message: string);
}
export declare class CollectionRequiresConfigError extends CollectionConfigurationError {
    constructor();
}
export declare class CollectionRequiresSyncConfigError extends CollectionConfigurationError {
    constructor();
}
export declare class InvalidSchemaError extends CollectionConfigurationError {
    constructor();
}
export declare class SchemaMustBeSynchronousError extends CollectionConfigurationError {
    constructor();
}
export declare class CollectionStateError extends TanStackDBError {
    constructor(message: string);
}
export declare class CollectionInErrorStateError extends CollectionStateError {
    constructor(operation: string, collectionId: string);
}
export declare class InvalidCollectionStatusTransitionError extends CollectionStateError {
    constructor(from: string, to: string, collectionId: string);
}
export declare class CollectionIsInErrorStateError extends CollectionStateError {
    constructor();
}
export declare class NegativeActiveSubscribersError extends CollectionStateError {
    constructor();
}
export declare class CollectionOperationError extends TanStackDBError {
    constructor(message: string);
}
export declare class UndefinedKeyError extends CollectionOperationError {
    constructor(item: any);
}
export declare class InvalidKeyError extends CollectionOperationError {
    constructor(key: unknown, item: unknown);
}
export declare class DuplicateKeyError extends CollectionOperationError {
    constructor(key: string | number);
}
export declare class DuplicateKeySyncError extends CollectionOperationError {
    constructor(key: string | number, collectionId: string, options?: {
        hasCustomGetKey?: boolean;
        hasJoins?: boolean;
    });
}
export declare class MissingUpdateArgumentError extends CollectionOperationError {
    constructor();
}
export declare class NoKeysPassedToUpdateError extends CollectionOperationError {
    constructor();
}
export declare class UpdateKeyNotFoundError extends CollectionOperationError {
    constructor(key: string | number);
}
export declare class KeyUpdateNotAllowedError extends CollectionOperationError {
    constructor(originalKey: string | number, newKey: string | number);
}
export declare class NoKeysPassedToDeleteError extends CollectionOperationError {
    constructor();
}
export declare class DeleteKeyNotFoundError extends CollectionOperationError {
    constructor(key: string | number);
}
export declare class MissingHandlerError extends TanStackDBError {
    constructor(message: string);
}
export declare class MissingInsertHandlerError extends MissingHandlerError {
    constructor();
}
export declare class MissingUpdateHandlerError extends MissingHandlerError {
    constructor();
}
export declare class MissingDeleteHandlerError extends MissingHandlerError {
    constructor();
}
export declare class TransactionError extends TanStackDBError {
    constructor(message: string);
}
export declare class MissingMutationFunctionError extends TransactionError {
    constructor();
}
export declare class OnMutateMustBeSynchronousError extends TransactionError {
    constructor();
}
export declare class TransactionNotPendingMutateError extends TransactionError {
    constructor();
}
export declare class TransactionAlreadyCompletedRollbackError extends TransactionError {
    constructor();
}
export declare class TransactionNotPendingCommitError extends TransactionError {
    constructor();
}
export declare class NoPendingSyncTransactionWriteError extends TransactionError {
    constructor();
}
export declare class SyncTransactionAlreadyCommittedWriteError extends TransactionError {
    constructor();
}
export declare class NoPendingSyncTransactionCommitError extends TransactionError {
    constructor();
}
export declare class SyncTransactionAlreadyCommittedError extends TransactionError {
    constructor();
}
export declare class QueryBuilderError extends TanStackDBError {
    constructor(message: string);
}
export declare class OnlyOneSourceAllowedError extends QueryBuilderError {
    constructor(context: string);
}
export declare class SubQueryMustHaveFromClauseError extends QueryBuilderError {
    constructor(context: string);
}
export declare class InvalidSourceError extends QueryBuilderError {
    constructor(alias: string);
}
export declare class InvalidSourceTypeError extends QueryBuilderError {
    constructor(context: string, type: string);
}
export declare class JoinConditionMustBeEqualityError extends QueryBuilderError {
    constructor();
}
export declare class QueryMustHaveFromClauseError extends QueryBuilderError {
    constructor();
}
export declare class QueryCompilationError extends TanStackDBError {
    constructor(message: string);
}
export declare class DistinctRequiresSelectError extends QueryCompilationError {
    constructor();
}
export declare class HavingRequiresGroupByError extends QueryCompilationError {
    constructor();
}
export declare class LimitOffsetRequireOrderByError extends QueryCompilationError {
    constructor();
}
/**
 * Error thrown when a collection input stream is not found during query compilation.
 * In self-joins, each alias (e.g., 'employee', 'manager') requires its own input stream.
 */
export declare class CollectionInputNotFoundError extends QueryCompilationError {
    constructor(alias: string, collectionId?: string, availableKeys?: Array<string>);
}
/**
 * Error thrown when a subquery uses the same alias as its parent query.
 * This causes issues because parent and subquery would share the same input streams,
 * leading to empty results or incorrect data (aggregation cross-leaking).
 */
export declare class DuplicateAliasInSubqueryError extends QueryCompilationError {
    constructor(alias: string, parentAliases: Array<string>);
}
export declare class UnsupportedFromTypeError extends QueryCompilationError {
    constructor(type: string);
}
export declare class UnknownExpressionTypeError extends QueryCompilationError {
    constructor(type: string);
}
export declare class EmptyReferencePathError extends QueryCompilationError {
    constructor();
}
export declare class UnknownFunctionError extends QueryCompilationError {
    constructor(functionName: string);
}
export declare class JoinCollectionNotFoundError extends QueryCompilationError {
    constructor(collectionId: string);
}
export declare class JoinError extends TanStackDBError {
    constructor(message: string);
}
export declare class UnsupportedJoinTypeError extends JoinError {
    constructor(joinType: string);
}
export declare class InvalidJoinConditionSameSourceError extends JoinError {
    constructor(sourceAlias: string);
}
export declare class InvalidJoinConditionSourceMismatchError extends JoinError {
    constructor();
}
export declare class InvalidJoinConditionLeftSourceError extends JoinError {
    constructor(sourceAlias: string);
}
export declare class InvalidJoinConditionRightSourceError extends JoinError {
    constructor(sourceAlias: string);
}
export declare class InvalidJoinCondition extends JoinError {
    constructor();
}
export declare class UnsupportedJoinSourceTypeError extends JoinError {
    constructor(type: string);
}
export declare class GroupByError extends TanStackDBError {
    constructor(message: string);
}
export declare class NonAggregateExpressionNotInGroupByError extends GroupByError {
    constructor(alias: string);
}
export declare class UnsupportedAggregateFunctionError extends GroupByError {
    constructor(functionName: string);
}
export declare class AggregateFunctionNotInSelectError extends GroupByError {
    constructor(functionName: string);
}
export declare class UnknownHavingExpressionTypeError extends GroupByError {
    constructor(type: string);
}
export declare class StorageError extends TanStackDBError {
    constructor(message: string);
}
export declare class SerializationError extends StorageError {
    constructor(operation: string, originalError: string);
}
export declare class LocalStorageCollectionError extends StorageError {
    constructor(message: string);
}
export declare class StorageKeyRequiredError extends LocalStorageCollectionError {
    constructor();
}
export declare class InvalidStorageDataFormatError extends LocalStorageCollectionError {
    constructor(storageKey: string, key: string);
}
export declare class InvalidStorageObjectFormatError extends LocalStorageCollectionError {
    constructor(storageKey: string);
}
export declare class SyncCleanupError extends TanStackDBError {
    constructor(collectionId: string, error: Error | string);
}
export declare class QueryOptimizerError extends TanStackDBError {
    constructor(message: string);
}
export declare class CannotCombineEmptyExpressionListError extends QueryOptimizerError {
    constructor();
}
/**
 * Internal error when the query optimizer fails to convert a WHERE clause to a collection filter.
 */
export declare class WhereClauseConversionError extends QueryOptimizerError {
    constructor(collectionId: string, alias: string);
}
/**
 * Error when a subscription cannot be found during lazy join processing.
 * For subqueries, aliases may be remapped (e.g., 'activeUser' → 'user').
 */
export declare class SubscriptionNotFoundError extends QueryCompilationError {
    constructor(resolvedAlias: string, originalAlias: string, collectionId: string, availableAliases: Array<string>);
}
/**
 * Error thrown when aggregate expressions are used outside of a GROUP BY context.
 */
export declare class AggregateNotSupportedError extends QueryCompilationError {
    constructor();
}
/**
 * Internal error when the compiler returns aliases that don't have corresponding input streams.
 * This should never happen since all aliases come from user declarations.
 */
export declare class MissingAliasInputsError extends QueryCompilationError {
    constructor(missingAliases: Array<string>);
}
/**
 * Error thrown when setWindow is called on a collection without an ORDER BY clause.
 */
export declare class SetWindowRequiresOrderByError extends QueryCompilationError {
    constructor();
}
