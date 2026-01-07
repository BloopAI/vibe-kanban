class TanStackDBError extends Error {
  constructor(message) {
    super(message);
    this.name = `TanStackDBError`;
  }
}
class NonRetriableError extends TanStackDBError {
  constructor(message) {
    super(message);
    this.name = `NonRetriableError`;
  }
}
class SchemaValidationError extends TanStackDBError {
  constructor(type, issues, message) {
    const defaultMessage = `${type === `insert` ? `Insert` : `Update`} validation failed: ${issues.map((issue) => `
- ${issue.message} - path: ${issue.path}`).join(``)}`;
    super(message || defaultMessage);
    this.name = `SchemaValidationError`;
    this.type = type;
    this.issues = issues;
  }
}
class DuplicateDbInstanceError extends TanStackDBError {
  constructor() {
    super(
      `Multiple instances of @tanstack/db detected!

This causes transaction context to be lost because each instance maintains its own transaction stack.

Common causes:
1. Different versions of @tanstack/db installed
2. Incompatible peer dependency versions in packages
3. Module resolution issues in bundler configuration

To fix:
1. Check installed versions: npm list @tanstack/db (or pnpm/yarn list)
2. Force a single version using package manager overrides:
   - npm: "overrides" in package.json
   - pnpm: "pnpm.overrides" in package.json
   - yarn: "resolutions" in package.json
3. Clear node_modules and lockfile, then reinstall

To temporarily disable this check (not recommended):
Set environment variable: TANSTACK_DB_DISABLE_DUP_CHECK=1

See: https://tanstack.com/db/latest/docs/troubleshooting#duplicate-instances`
    );
    this.name = `DuplicateDbInstanceError`;
  }
}
class CollectionConfigurationError extends TanStackDBError {
  constructor(message) {
    super(message);
    this.name = `CollectionConfigurationError`;
  }
}
class CollectionRequiresConfigError extends CollectionConfigurationError {
  constructor() {
    super(`Collection requires a config`);
  }
}
class CollectionRequiresSyncConfigError extends CollectionConfigurationError {
  constructor() {
    super(`Collection requires a sync config`);
  }
}
class InvalidSchemaError extends CollectionConfigurationError {
  constructor() {
    super(`Schema must implement the standard-schema interface`);
  }
}
class SchemaMustBeSynchronousError extends CollectionConfigurationError {
  constructor() {
    super(`Schema validation must be synchronous`);
  }
}
class CollectionStateError extends TanStackDBError {
  constructor(message) {
    super(message);
    this.name = `CollectionStateError`;
  }
}
class CollectionInErrorStateError extends CollectionStateError {
  constructor(operation, collectionId) {
    super(
      `Cannot perform ${operation} on collection "${collectionId}" - collection is in error state. Try calling cleanup() and restarting the collection.`
    );
  }
}
class InvalidCollectionStatusTransitionError extends CollectionStateError {
  constructor(from, to, collectionId) {
    super(
      `Invalid collection status transition from "${from}" to "${to}" for collection "${collectionId}"`
    );
  }
}
class CollectionIsInErrorStateError extends CollectionStateError {
  constructor() {
    super(`Collection is in error state`);
  }
}
class NegativeActiveSubscribersError extends CollectionStateError {
  constructor() {
    super(`Active subscribers count is negative - this should never happen`);
  }
}
class CollectionOperationError extends TanStackDBError {
  constructor(message) {
    super(message);
    this.name = `CollectionOperationError`;
  }
}
class UndefinedKeyError extends CollectionOperationError {
  constructor(item) {
    super(
      `An object was created without a defined key: ${JSON.stringify(item)}`
    );
  }
}
class InvalidKeyError extends CollectionOperationError {
  constructor(key, item) {
    const keyType = key === null ? `null` : typeof key;
    super(
      `getKey returned an invalid key type. Expected string or number, but got ${keyType}: ${JSON.stringify(key)}. Item: ${JSON.stringify(item)}`
    );
  }
}
class DuplicateKeyError extends CollectionOperationError {
  constructor(key) {
    super(
      `Cannot insert document with ID "${key}" because it already exists in the collection`
    );
  }
}
class DuplicateKeySyncError extends CollectionOperationError {
  constructor(key, collectionId, options) {
    const baseMessage = `Cannot insert document with key "${key}" from sync because it already exists in the collection "${collectionId}"`;
    if (options?.hasCustomGetKey && options.hasJoins) {
      super(
        `${baseMessage}. This collection uses a custom getKey with joined queries. Joined queries can produce multiple rows with the same key when relationships are not 1:1. Consider: (1) using a composite key in your getKey function (e.g., \`\${item.key1}-\${item.key2}\`), (2) ensuring your join produces unique rows per key, or (3) removing the custom getKey to use the default composite key behavior.`
      );
    } else {
      super(baseMessage);
    }
  }
}
class MissingUpdateArgumentError extends CollectionOperationError {
  constructor() {
    super(`The first argument to update is missing`);
  }
}
class NoKeysPassedToUpdateError extends CollectionOperationError {
  constructor() {
    super(`No keys were passed to update`);
  }
}
class UpdateKeyNotFoundError extends CollectionOperationError {
  constructor(key) {
    super(
      `The key "${key}" was passed to update but an object for this key was not found in the collection`
    );
  }
}
class KeyUpdateNotAllowedError extends CollectionOperationError {
  constructor(originalKey, newKey) {
    super(
      `Updating the key of an item is not allowed. Original key: "${originalKey}", Attempted new key: "${newKey}". Please delete the old item and create a new one if a key change is necessary.`
    );
  }
}
class NoKeysPassedToDeleteError extends CollectionOperationError {
  constructor() {
    super(`No keys were passed to delete`);
  }
}
class DeleteKeyNotFoundError extends CollectionOperationError {
  constructor(key) {
    super(
      `Collection.delete was called with key '${key}' but there is no item in the collection with this key`
    );
  }
}
class MissingHandlerError extends TanStackDBError {
  constructor(message) {
    super(message);
    this.name = `MissingHandlerError`;
  }
}
class MissingInsertHandlerError extends MissingHandlerError {
  constructor() {
    super(
      `Collection.insert called directly (not within an explicit transaction) but no 'onInsert' handler is configured.`
    );
  }
}
class MissingUpdateHandlerError extends MissingHandlerError {
  constructor() {
    super(
      `Collection.update called directly (not within an explicit transaction) but no 'onUpdate' handler is configured.`
    );
  }
}
class MissingDeleteHandlerError extends MissingHandlerError {
  constructor() {
    super(
      `Collection.delete called directly (not within an explicit transaction) but no 'onDelete' handler is configured.`
    );
  }
}
class TransactionError extends TanStackDBError {
  constructor(message) {
    super(message);
    this.name = `TransactionError`;
  }
}
class MissingMutationFunctionError extends TransactionError {
  constructor() {
    super(`mutationFn is required when creating a transaction`);
  }
}
class OnMutateMustBeSynchronousError extends TransactionError {
  constructor() {
    super(
      `onMutate must be synchronous and cannot return a promise. Remove async/await or returned promises from onMutate.`
    );
    this.name = `OnMutateMustBeSynchronousError`;
  }
}
class TransactionNotPendingMutateError extends TransactionError {
  constructor() {
    super(
      `You can no longer call .mutate() as the transaction is no longer pending`
    );
  }
}
class TransactionAlreadyCompletedRollbackError extends TransactionError {
  constructor() {
    super(
      `You can no longer call .rollback() as the transaction is already completed`
    );
  }
}
class TransactionNotPendingCommitError extends TransactionError {
  constructor() {
    super(
      `You can no longer call .commit() as the transaction is no longer pending`
    );
  }
}
class NoPendingSyncTransactionWriteError extends TransactionError {
  constructor() {
    super(`No pending sync transaction to write to`);
  }
}
class SyncTransactionAlreadyCommittedWriteError extends TransactionError {
  constructor() {
    super(
      `The pending sync transaction is already committed, you can't still write to it.`
    );
  }
}
class NoPendingSyncTransactionCommitError extends TransactionError {
  constructor() {
    super(`No pending sync transaction to commit`);
  }
}
class SyncTransactionAlreadyCommittedError extends TransactionError {
  constructor() {
    super(
      `The pending sync transaction is already committed, you can't commit it again.`
    );
  }
}
class QueryBuilderError extends TanStackDBError {
  constructor(message) {
    super(message);
    this.name = `QueryBuilderError`;
  }
}
class OnlyOneSourceAllowedError extends QueryBuilderError {
  constructor(context) {
    super(`Only one source is allowed in the ${context}`);
  }
}
class SubQueryMustHaveFromClauseError extends QueryBuilderError {
  constructor(context) {
    super(`A sub query passed to a ${context} must have a from clause itself`);
  }
}
class InvalidSourceError extends QueryBuilderError {
  constructor(alias) {
    super(
      `Invalid source for live query: The value provided for alias "${alias}" is not a Collection or subquery. Live queries only accept Collection instances or subqueries. Please ensure you're passing a valid Collection or QueryBuilder, not a plain array or other data type.`
    );
  }
}
class InvalidSourceTypeError extends QueryBuilderError {
  constructor(context, type) {
    super(
      `Invalid source for ${context}: Expected an object with a single key-value pair like { alias: collection }. For example: .from({ todos: todosCollection }). Got: ${type}`
    );
  }
}
class JoinConditionMustBeEqualityError extends QueryBuilderError {
  constructor() {
    super(`Join condition must be an equality expression`);
  }
}
class QueryMustHaveFromClauseError extends QueryBuilderError {
  constructor() {
    super(`Query must have a from clause`);
  }
}
class QueryCompilationError extends TanStackDBError {
  constructor(message) {
    super(message);
    this.name = `QueryCompilationError`;
  }
}
class DistinctRequiresSelectError extends QueryCompilationError {
  constructor() {
    super(`DISTINCT requires a SELECT clause.`);
  }
}
class HavingRequiresGroupByError extends QueryCompilationError {
  constructor() {
    super(`HAVING clause requires GROUP BY clause`);
  }
}
class LimitOffsetRequireOrderByError extends QueryCompilationError {
  constructor() {
    super(
      `LIMIT and OFFSET require an ORDER BY clause to ensure deterministic results`
    );
  }
}
class CollectionInputNotFoundError extends QueryCompilationError {
  constructor(alias, collectionId, availableKeys) {
    const details = collectionId ? `alias "${alias}" (collection "${collectionId}")` : `collection "${alias}"`;
    const availableKeysMsg = availableKeys?.length ? `. Available keys: ${availableKeys.join(`, `)}` : ``;
    super(`Input for ${details} not found in inputs map${availableKeysMsg}`);
  }
}
class DuplicateAliasInSubqueryError extends QueryCompilationError {
  constructor(alias, parentAliases) {
    super(
      `Subquery uses alias "${alias}" which is already used in the parent query. Each alias must be unique across parent and subquery contexts. Parent query aliases: ${parentAliases.join(`, `)}. Please rename "${alias}" in either the parent query or subquery to avoid conflicts.`
    );
  }
}
class UnsupportedFromTypeError extends QueryCompilationError {
  constructor(type) {
    super(`Unsupported FROM type: ${type}`);
  }
}
class UnknownExpressionTypeError extends QueryCompilationError {
  constructor(type) {
    super(`Unknown expression type: ${type}`);
  }
}
class EmptyReferencePathError extends QueryCompilationError {
  constructor() {
    super(`Reference path cannot be empty`);
  }
}
class UnknownFunctionError extends QueryCompilationError {
  constructor(functionName) {
    super(`Unknown function: ${functionName}`);
  }
}
class JoinCollectionNotFoundError extends QueryCompilationError {
  constructor(collectionId) {
    super(`Collection "${collectionId}" not found during compilation of join`);
  }
}
class JoinError extends TanStackDBError {
  constructor(message) {
    super(message);
    this.name = `JoinError`;
  }
}
class UnsupportedJoinTypeError extends JoinError {
  constructor(joinType) {
    super(`Unsupported join type: ${joinType}`);
  }
}
class InvalidJoinConditionSameSourceError extends JoinError {
  constructor(sourceAlias) {
    super(
      `Invalid join condition: both expressions refer to the same source "${sourceAlias}"`
    );
  }
}
class InvalidJoinConditionSourceMismatchError extends JoinError {
  constructor() {
    super(`Invalid join condition: expressions must reference source aliases`);
  }
}
class InvalidJoinConditionLeftSourceError extends JoinError {
  constructor(sourceAlias) {
    super(
      `Invalid join condition: left expression refers to an unavailable source "${sourceAlias}"`
    );
  }
}
class InvalidJoinConditionRightSourceError extends JoinError {
  constructor(sourceAlias) {
    super(
      `Invalid join condition: right expression does not refer to the joined source "${sourceAlias}"`
    );
  }
}
class InvalidJoinCondition extends JoinError {
  constructor() {
    super(`Invalid join condition`);
  }
}
class UnsupportedJoinSourceTypeError extends JoinError {
  constructor(type) {
    super(`Unsupported join source type: ${type}`);
  }
}
class GroupByError extends TanStackDBError {
  constructor(message) {
    super(message);
    this.name = `GroupByError`;
  }
}
class NonAggregateExpressionNotInGroupByError extends GroupByError {
  constructor(alias) {
    super(
      `Non-aggregate expression '${alias}' in SELECT must also appear in GROUP BY clause`
    );
  }
}
class UnsupportedAggregateFunctionError extends GroupByError {
  constructor(functionName) {
    super(`Unsupported aggregate function: ${functionName}`);
  }
}
class AggregateFunctionNotInSelectError extends GroupByError {
  constructor(functionName) {
    super(
      `Aggregate function in HAVING clause must also be in SELECT clause: ${functionName}`
    );
  }
}
class UnknownHavingExpressionTypeError extends GroupByError {
  constructor(type) {
    super(`Unknown expression type in HAVING clause: ${type}`);
  }
}
class StorageError extends TanStackDBError {
  constructor(message) {
    super(message);
    this.name = `StorageError`;
  }
}
class SerializationError extends StorageError {
  constructor(operation, originalError) {
    super(
      `Cannot ${operation} item because it cannot be JSON serialized: ${originalError}`
    );
  }
}
class LocalStorageCollectionError extends StorageError {
  constructor(message) {
    super(message);
    this.name = `LocalStorageCollectionError`;
  }
}
class StorageKeyRequiredError extends LocalStorageCollectionError {
  constructor() {
    super(`[LocalStorageCollection] storageKey must be provided.`);
  }
}
class InvalidStorageDataFormatError extends LocalStorageCollectionError {
  constructor(storageKey, key) {
    super(
      `[LocalStorageCollection] Invalid data format in storage key "${storageKey}" for key "${key}".`
    );
  }
}
class InvalidStorageObjectFormatError extends LocalStorageCollectionError {
  constructor(storageKey) {
    super(
      `[LocalStorageCollection] Invalid data format in storage key "${storageKey}". Expected object format.`
    );
  }
}
class SyncCleanupError extends TanStackDBError {
  constructor(collectionId, error) {
    const message = error instanceof Error ? error.message : String(error);
    super(
      `Collection "${collectionId}" sync cleanup function threw an error: ${message}`
    );
    this.name = `SyncCleanupError`;
  }
}
class QueryOptimizerError extends TanStackDBError {
  constructor(message) {
    super(message);
    this.name = `QueryOptimizerError`;
  }
}
class CannotCombineEmptyExpressionListError extends QueryOptimizerError {
  constructor() {
    super(`Cannot combine empty expression list`);
  }
}
class WhereClauseConversionError extends QueryOptimizerError {
  constructor(collectionId, alias) {
    super(
      `Failed to convert WHERE clause to collection filter for collection '${collectionId}' alias '${alias}'. This indicates a bug in the query optimization logic.`
    );
  }
}
class SubscriptionNotFoundError extends QueryCompilationError {
  constructor(resolvedAlias, originalAlias, collectionId, availableAliases) {
    super(
      `Internal error: subscription for alias '${resolvedAlias}' (remapped from '${originalAlias}', collection '${collectionId}') is missing in join pipeline. Available aliases: ${availableAliases.join(`, `)}. This indicates a bug in alias tracking.`
    );
  }
}
class AggregateNotSupportedError extends QueryCompilationError {
  constructor() {
    super(
      `Aggregate expressions are not supported in this context. Use GROUP BY clause for aggregates.`
    );
  }
}
class MissingAliasInputsError extends QueryCompilationError {
  constructor(missingAliases) {
    super(
      `Internal error: compiler returned aliases without inputs: ${missingAliases.join(`, `)}. This indicates a bug in query compilation. Please report this issue.`
    );
  }
}
class SetWindowRequiresOrderByError extends QueryCompilationError {
  constructor() {
    super(
      `setWindow() can only be called on collections with an ORDER BY clause. Add .orderBy() to your query to enable window movement.`
    );
  }
}
export {
  AggregateFunctionNotInSelectError,
  AggregateNotSupportedError,
  CannotCombineEmptyExpressionListError,
  CollectionConfigurationError,
  CollectionInErrorStateError,
  CollectionInputNotFoundError,
  CollectionIsInErrorStateError,
  CollectionOperationError,
  CollectionRequiresConfigError,
  CollectionRequiresSyncConfigError,
  CollectionStateError,
  DeleteKeyNotFoundError,
  DistinctRequiresSelectError,
  DuplicateAliasInSubqueryError,
  DuplicateDbInstanceError,
  DuplicateKeyError,
  DuplicateKeySyncError,
  EmptyReferencePathError,
  GroupByError,
  HavingRequiresGroupByError,
  InvalidCollectionStatusTransitionError,
  InvalidJoinCondition,
  InvalidJoinConditionLeftSourceError,
  InvalidJoinConditionRightSourceError,
  InvalidJoinConditionSameSourceError,
  InvalidJoinConditionSourceMismatchError,
  InvalidKeyError,
  InvalidSchemaError,
  InvalidSourceError,
  InvalidSourceTypeError,
  InvalidStorageDataFormatError,
  InvalidStorageObjectFormatError,
  JoinCollectionNotFoundError,
  JoinConditionMustBeEqualityError,
  JoinError,
  KeyUpdateNotAllowedError,
  LimitOffsetRequireOrderByError,
  LocalStorageCollectionError,
  MissingAliasInputsError,
  MissingDeleteHandlerError,
  MissingHandlerError,
  MissingInsertHandlerError,
  MissingMutationFunctionError,
  MissingUpdateArgumentError,
  MissingUpdateHandlerError,
  NegativeActiveSubscribersError,
  NoKeysPassedToDeleteError,
  NoKeysPassedToUpdateError,
  NoPendingSyncTransactionCommitError,
  NoPendingSyncTransactionWriteError,
  NonAggregateExpressionNotInGroupByError,
  NonRetriableError,
  OnMutateMustBeSynchronousError,
  OnlyOneSourceAllowedError,
  QueryBuilderError,
  QueryCompilationError,
  QueryMustHaveFromClauseError,
  QueryOptimizerError,
  SchemaMustBeSynchronousError,
  SchemaValidationError,
  SerializationError,
  SetWindowRequiresOrderByError,
  StorageError,
  StorageKeyRequiredError,
  SubQueryMustHaveFromClauseError,
  SubscriptionNotFoundError,
  SyncCleanupError,
  SyncTransactionAlreadyCommittedError,
  SyncTransactionAlreadyCommittedWriteError,
  TanStackDBError,
  TransactionAlreadyCompletedRollbackError,
  TransactionError,
  TransactionNotPendingCommitError,
  TransactionNotPendingMutateError,
  UndefinedKeyError,
  UnknownExpressionTypeError,
  UnknownFunctionError,
  UnknownHavingExpressionTypeError,
  UnsupportedAggregateFunctionError,
  UnsupportedFromTypeError,
  UnsupportedJoinSourceTypeError,
  UnsupportedJoinTypeError,
  UpdateKeyNotFoundError,
  WhereClauseConversionError
};
//# sourceMappingURL=errors.js.map
