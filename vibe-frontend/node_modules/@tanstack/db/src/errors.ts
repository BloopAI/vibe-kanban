// Root error class for all TanStack DB errors
export class TanStackDBError extends Error {
  constructor(message: string) {
    super(message)
    this.name = `TanStackDBError`
  }
}

// Base error classes
export class NonRetriableError extends TanStackDBError {
  constructor(message: string) {
    super(message)
    this.name = `NonRetriableError`
  }
}

// Schema validation error (exported from index for backward compatibility)
export class SchemaValidationError extends TanStackDBError {
  type: `insert` | `update`
  issues: ReadonlyArray<{
    message: string
    path?: ReadonlyArray<string | number | symbol>
  }>

  constructor(
    type: `insert` | `update`,
    issues: ReadonlyArray<{
      message: string
      path?: ReadonlyArray<string | number | symbol>
    }>,
    message?: string,
  ) {
    const defaultMessage = `${type === `insert` ? `Insert` : `Update`} validation failed: ${issues
      .map((issue) => `\n- ${issue.message} - path: ${issue.path}`)
      .join(``)}`

    super(message || defaultMessage)
    this.name = `SchemaValidationError`
    this.type = type
    this.issues = issues
  }
}

// Module Instance Errors
export class DuplicateDbInstanceError extends TanStackDBError {
  constructor() {
    super(
      `Multiple instances of @tanstack/db detected!\n\n` +
        `This causes transaction context to be lost because each instance maintains ` +
        `its own transaction stack.\n\n` +
        `Common causes:\n` +
        `1. Different versions of @tanstack/db installed\n` +
        `2. Incompatible peer dependency versions in packages\n` +
        `3. Module resolution issues in bundler configuration\n\n` +
        `To fix:\n` +
        `1. Check installed versions: npm list @tanstack/db (or pnpm/yarn list)\n` +
        `2. Force a single version using package manager overrides:\n` +
        `   - npm: "overrides" in package.json\n` +
        `   - pnpm: "pnpm.overrides" in package.json\n` +
        `   - yarn: "resolutions" in package.json\n` +
        `3. Clear node_modules and lockfile, then reinstall\n\n` +
        `To temporarily disable this check (not recommended):\n` +
        `Set environment variable: TANSTACK_DB_DISABLE_DUP_CHECK=1\n\n` +
        `See: https://tanstack.com/db/latest/docs/troubleshooting#duplicate-instances`,
    )
    this.name = `DuplicateDbInstanceError`
  }
}

// Collection Configuration Errors
export class CollectionConfigurationError extends TanStackDBError {
  constructor(message: string) {
    super(message)
    this.name = `CollectionConfigurationError`
  }
}

export class CollectionRequiresConfigError extends CollectionConfigurationError {
  constructor() {
    super(`Collection requires a config`)
  }
}

export class CollectionRequiresSyncConfigError extends CollectionConfigurationError {
  constructor() {
    super(`Collection requires a sync config`)
  }
}

export class InvalidSchemaError extends CollectionConfigurationError {
  constructor() {
    super(`Schema must implement the standard-schema interface`)
  }
}

export class SchemaMustBeSynchronousError extends CollectionConfigurationError {
  constructor() {
    super(`Schema validation must be synchronous`)
  }
}

// Collection State Errors
export class CollectionStateError extends TanStackDBError {
  constructor(message: string) {
    super(message)
    this.name = `CollectionStateError`
  }
}

export class CollectionInErrorStateError extends CollectionStateError {
  constructor(operation: string, collectionId: string) {
    super(
      `Cannot perform ${operation} on collection "${collectionId}" - collection is in error state. Try calling cleanup() and restarting the collection.`,
    )
  }
}

export class InvalidCollectionStatusTransitionError extends CollectionStateError {
  constructor(from: string, to: string, collectionId: string) {
    super(
      `Invalid collection status transition from "${from}" to "${to}" for collection "${collectionId}"`,
    )
  }
}

export class CollectionIsInErrorStateError extends CollectionStateError {
  constructor() {
    super(`Collection is in error state`)
  }
}

export class NegativeActiveSubscribersError extends CollectionStateError {
  constructor() {
    super(`Active subscribers count is negative - this should never happen`)
  }
}

// Collection Operation Errors
export class CollectionOperationError extends TanStackDBError {
  constructor(message: string) {
    super(message)
    this.name = `CollectionOperationError`
  }
}

export class UndefinedKeyError extends CollectionOperationError {
  constructor(item: any) {
    super(
      `An object was created without a defined key: ${JSON.stringify(item)}`,
    )
  }
}

export class InvalidKeyError extends CollectionOperationError {
  constructor(key: unknown, item: unknown) {
    const keyType = key === null ? `null` : typeof key
    super(
      `getKey returned an invalid key type. Expected string or number, but got ${keyType}: ${JSON.stringify(key)}. Item: ${JSON.stringify(item)}`,
    )
  }
}

export class DuplicateKeyError extends CollectionOperationError {
  constructor(key: string | number) {
    super(
      `Cannot insert document with ID "${key}" because it already exists in the collection`,
    )
  }
}

export class DuplicateKeySyncError extends CollectionOperationError {
  constructor(
    key: string | number,
    collectionId: string,
    options?: { hasCustomGetKey?: boolean; hasJoins?: boolean },
  ) {
    const baseMessage = `Cannot insert document with key "${key}" from sync because it already exists in the collection "${collectionId}"`

    // Provide enhanced guidance when custom getKey is used with joins
    if (options?.hasCustomGetKey && options.hasJoins) {
      super(
        `${baseMessage}. ` +
          `This collection uses a custom getKey with joined queries. ` +
          `Joined queries can produce multiple rows with the same key when relationships are not 1:1. ` +
          `Consider: (1) using a composite key in your getKey function (e.g., \`\${item.key1}-\${item.key2}\`), ` +
          `(2) ensuring your join produces unique rows per key, or (3) removing the custom getKey ` +
          `to use the default composite key behavior.`,
      )
    } else {
      super(baseMessage)
    }
  }
}

export class MissingUpdateArgumentError extends CollectionOperationError {
  constructor() {
    super(`The first argument to update is missing`)
  }
}

export class NoKeysPassedToUpdateError extends CollectionOperationError {
  constructor() {
    super(`No keys were passed to update`)
  }
}

export class UpdateKeyNotFoundError extends CollectionOperationError {
  constructor(key: string | number) {
    super(
      `The key "${key}" was passed to update but an object for this key was not found in the collection`,
    )
  }
}

export class KeyUpdateNotAllowedError extends CollectionOperationError {
  constructor(originalKey: string | number, newKey: string | number) {
    super(
      `Updating the key of an item is not allowed. Original key: "${originalKey}", Attempted new key: "${newKey}". Please delete the old item and create a new one if a key change is necessary.`,
    )
  }
}

export class NoKeysPassedToDeleteError extends CollectionOperationError {
  constructor() {
    super(`No keys were passed to delete`)
  }
}

export class DeleteKeyNotFoundError extends CollectionOperationError {
  constructor(key: string | number) {
    super(
      `Collection.delete was called with key '${key}' but there is no item in the collection with this key`,
    )
  }
}

// Collection Handler Errors
export class MissingHandlerError extends TanStackDBError {
  constructor(message: string) {
    super(message)
    this.name = `MissingHandlerError`
  }
}

export class MissingInsertHandlerError extends MissingHandlerError {
  constructor() {
    super(
      `Collection.insert called directly (not within an explicit transaction) but no 'onInsert' handler is configured.`,
    )
  }
}

export class MissingUpdateHandlerError extends MissingHandlerError {
  constructor() {
    super(
      `Collection.update called directly (not within an explicit transaction) but no 'onUpdate' handler is configured.`,
    )
  }
}

export class MissingDeleteHandlerError extends MissingHandlerError {
  constructor() {
    super(
      `Collection.delete called directly (not within an explicit transaction) but no 'onDelete' handler is configured.`,
    )
  }
}

// Transaction Errors
export class TransactionError extends TanStackDBError {
  constructor(message: string) {
    super(message)
    this.name = `TransactionError`
  }
}

export class MissingMutationFunctionError extends TransactionError {
  constructor() {
    super(`mutationFn is required when creating a transaction`)
  }
}

export class OnMutateMustBeSynchronousError extends TransactionError {
  constructor() {
    super(
      `onMutate must be synchronous and cannot return a promise. Remove async/await or returned promises from onMutate.`,
    )
    this.name = `OnMutateMustBeSynchronousError`
  }
}

export class TransactionNotPendingMutateError extends TransactionError {
  constructor() {
    super(
      `You can no longer call .mutate() as the transaction is no longer pending`,
    )
  }
}

export class TransactionAlreadyCompletedRollbackError extends TransactionError {
  constructor() {
    super(
      `You can no longer call .rollback() as the transaction is already completed`,
    )
  }
}

export class TransactionNotPendingCommitError extends TransactionError {
  constructor() {
    super(
      `You can no longer call .commit() as the transaction is no longer pending`,
    )
  }
}

export class NoPendingSyncTransactionWriteError extends TransactionError {
  constructor() {
    super(`No pending sync transaction to write to`)
  }
}

export class SyncTransactionAlreadyCommittedWriteError extends TransactionError {
  constructor() {
    super(
      `The pending sync transaction is already committed, you can't still write to it.`,
    )
  }
}

export class NoPendingSyncTransactionCommitError extends TransactionError {
  constructor() {
    super(`No pending sync transaction to commit`)
  }
}

export class SyncTransactionAlreadyCommittedError extends TransactionError {
  constructor() {
    super(
      `The pending sync transaction is already committed, you can't commit it again.`,
    )
  }
}

// Query Builder Errors
export class QueryBuilderError extends TanStackDBError {
  constructor(message: string) {
    super(message)
    this.name = `QueryBuilderError`
  }
}

export class OnlyOneSourceAllowedError extends QueryBuilderError {
  constructor(context: string) {
    super(`Only one source is allowed in the ${context}`)
  }
}

export class SubQueryMustHaveFromClauseError extends QueryBuilderError {
  constructor(context: string) {
    super(`A sub query passed to a ${context} must have a from clause itself`)
  }
}

export class InvalidSourceError extends QueryBuilderError {
  constructor(alias: string) {
    super(
      `Invalid source for live query: The value provided for alias "${alias}" is not a Collection or subquery. Live queries only accept Collection instances or subqueries. Please ensure you're passing a valid Collection or QueryBuilder, not a plain array or other data type.`,
    )
  }
}

export class InvalidSourceTypeError extends QueryBuilderError {
  constructor(context: string, type: string) {
    super(
      `Invalid source for ${context}: Expected an object with a single key-value pair like { alias: collection }. ` +
        `For example: .from({ todos: todosCollection }). Got: ${type}`,
    )
  }
}

export class JoinConditionMustBeEqualityError extends QueryBuilderError {
  constructor() {
    super(`Join condition must be an equality expression`)
  }
}

export class QueryMustHaveFromClauseError extends QueryBuilderError {
  constructor() {
    super(`Query must have a from clause`)
  }
}

// Query Compilation Errors
export class QueryCompilationError extends TanStackDBError {
  constructor(message: string) {
    super(message)
    this.name = `QueryCompilationError`
  }
}

export class DistinctRequiresSelectError extends QueryCompilationError {
  constructor() {
    super(`DISTINCT requires a SELECT clause.`)
  }
}

export class HavingRequiresGroupByError extends QueryCompilationError {
  constructor() {
    super(`HAVING clause requires GROUP BY clause`)
  }
}

export class LimitOffsetRequireOrderByError extends QueryCompilationError {
  constructor() {
    super(
      `LIMIT and OFFSET require an ORDER BY clause to ensure deterministic results`,
    )
  }
}

/**
 * Error thrown when a collection input stream is not found during query compilation.
 * In self-joins, each alias (e.g., 'employee', 'manager') requires its own input stream.
 */
export class CollectionInputNotFoundError extends QueryCompilationError {
  constructor(
    alias: string,
    collectionId?: string,
    availableKeys?: Array<string>,
  ) {
    const details = collectionId
      ? `alias "${alias}" (collection "${collectionId}")`
      : `collection "${alias}"`
    const availableKeysMsg = availableKeys?.length
      ? `. Available keys: ${availableKeys.join(`, `)}`
      : ``
    super(`Input for ${details} not found in inputs map${availableKeysMsg}`)
  }
}

/**
 * Error thrown when a subquery uses the same alias as its parent query.
 * This causes issues because parent and subquery would share the same input streams,
 * leading to empty results or incorrect data (aggregation cross-leaking).
 */
export class DuplicateAliasInSubqueryError extends QueryCompilationError {
  constructor(alias: string, parentAliases: Array<string>) {
    super(
      `Subquery uses alias "${alias}" which is already used in the parent query. ` +
        `Each alias must be unique across parent and subquery contexts. ` +
        `Parent query aliases: ${parentAliases.join(`, `)}. ` +
        `Please rename "${alias}" in either the parent query or subquery to avoid conflicts.`,
    )
  }
}

export class UnsupportedFromTypeError extends QueryCompilationError {
  constructor(type: string) {
    super(`Unsupported FROM type: ${type}`)
  }
}

export class UnknownExpressionTypeError extends QueryCompilationError {
  constructor(type: string) {
    super(`Unknown expression type: ${type}`)
  }
}

export class EmptyReferencePathError extends QueryCompilationError {
  constructor() {
    super(`Reference path cannot be empty`)
  }
}

export class UnknownFunctionError extends QueryCompilationError {
  constructor(functionName: string) {
    super(`Unknown function: ${functionName}`)
  }
}

export class JoinCollectionNotFoundError extends QueryCompilationError {
  constructor(collectionId: string) {
    super(`Collection "${collectionId}" not found during compilation of join`)
  }
}

// JOIN Operation Errors
export class JoinError extends TanStackDBError {
  constructor(message: string) {
    super(message)
    this.name = `JoinError`
  }
}

export class UnsupportedJoinTypeError extends JoinError {
  constructor(joinType: string) {
    super(`Unsupported join type: ${joinType}`)
  }
}

export class InvalidJoinConditionSameSourceError extends JoinError {
  constructor(sourceAlias: string) {
    super(
      `Invalid join condition: both expressions refer to the same source "${sourceAlias}"`,
    )
  }
}

export class InvalidJoinConditionSourceMismatchError extends JoinError {
  constructor() {
    super(`Invalid join condition: expressions must reference source aliases`)
  }
}

export class InvalidJoinConditionLeftSourceError extends JoinError {
  constructor(sourceAlias: string) {
    super(
      `Invalid join condition: left expression refers to an unavailable source "${sourceAlias}"`,
    )
  }
}

export class InvalidJoinConditionRightSourceError extends JoinError {
  constructor(sourceAlias: string) {
    super(
      `Invalid join condition: right expression does not refer to the joined source "${sourceAlias}"`,
    )
  }
}

export class InvalidJoinCondition extends JoinError {
  constructor() {
    super(`Invalid join condition`)
  }
}

export class UnsupportedJoinSourceTypeError extends JoinError {
  constructor(type: string) {
    super(`Unsupported join source type: ${type}`)
  }
}

// GROUP BY and Aggregation Errors
export class GroupByError extends TanStackDBError {
  constructor(message: string) {
    super(message)
    this.name = `GroupByError`
  }
}

export class NonAggregateExpressionNotInGroupByError extends GroupByError {
  constructor(alias: string) {
    super(
      `Non-aggregate expression '${alias}' in SELECT must also appear in GROUP BY clause`,
    )
  }
}

export class UnsupportedAggregateFunctionError extends GroupByError {
  constructor(functionName: string) {
    super(`Unsupported aggregate function: ${functionName}`)
  }
}

export class AggregateFunctionNotInSelectError extends GroupByError {
  constructor(functionName: string) {
    super(
      `Aggregate function in HAVING clause must also be in SELECT clause: ${functionName}`,
    )
  }
}

export class UnknownHavingExpressionTypeError extends GroupByError {
  constructor(type: string) {
    super(`Unknown expression type in HAVING clause: ${type}`)
  }
}

// Storage Errors
export class StorageError extends TanStackDBError {
  constructor(message: string) {
    super(message)
    this.name = `StorageError`
  }
}

export class SerializationError extends StorageError {
  constructor(operation: string, originalError: string) {
    super(
      `Cannot ${operation} item because it cannot be JSON serialized: ${originalError}`,
    )
  }
}

// LocalStorage Collection Errors
export class LocalStorageCollectionError extends StorageError {
  constructor(message: string) {
    super(message)
    this.name = `LocalStorageCollectionError`
  }
}

export class StorageKeyRequiredError extends LocalStorageCollectionError {
  constructor() {
    super(`[LocalStorageCollection] storageKey must be provided.`)
  }
}

export class InvalidStorageDataFormatError extends LocalStorageCollectionError {
  constructor(storageKey: string, key: string) {
    super(
      `[LocalStorageCollection] Invalid data format in storage key "${storageKey}" for key "${key}".`,
    )
  }
}

export class InvalidStorageObjectFormatError extends LocalStorageCollectionError {
  constructor(storageKey: string) {
    super(
      `[LocalStorageCollection] Invalid data format in storage key "${storageKey}". Expected object format.`,
    )
  }
}

// Sync Cleanup Errors
export class SyncCleanupError extends TanStackDBError {
  constructor(collectionId: string, error: Error | string) {
    const message = error instanceof Error ? error.message : String(error)
    super(
      `Collection "${collectionId}" sync cleanup function threw an error: ${message}`,
    )
    this.name = `SyncCleanupError`
  }
}

// Query Optimizer Errors
export class QueryOptimizerError extends TanStackDBError {
  constructor(message: string) {
    super(message)
    this.name = `QueryOptimizerError`
  }
}

export class CannotCombineEmptyExpressionListError extends QueryOptimizerError {
  constructor() {
    super(`Cannot combine empty expression list`)
  }
}

/**
 * Internal error when the query optimizer fails to convert a WHERE clause to a collection filter.
 */
export class WhereClauseConversionError extends QueryOptimizerError {
  constructor(collectionId: string, alias: string) {
    super(
      `Failed to convert WHERE clause to collection filter for collection '${collectionId}' alias '${alias}'. This indicates a bug in the query optimization logic.`,
    )
  }
}

/**
 * Error when a subscription cannot be found during lazy join processing.
 * For subqueries, aliases may be remapped (e.g., 'activeUser' → 'user').
 */
export class SubscriptionNotFoundError extends QueryCompilationError {
  constructor(
    resolvedAlias: string,
    originalAlias: string,
    collectionId: string,
    availableAliases: Array<string>,
  ) {
    super(
      `Internal error: subscription for alias '${resolvedAlias}' (remapped from '${originalAlias}', collection '${collectionId}') is missing in join pipeline. Available aliases: ${availableAliases.join(`, `)}. This indicates a bug in alias tracking.`,
    )
  }
}

/**
 * Error thrown when aggregate expressions are used outside of a GROUP BY context.
 */
export class AggregateNotSupportedError extends QueryCompilationError {
  constructor() {
    super(
      `Aggregate expressions are not supported in this context. Use GROUP BY clause for aggregates.`,
    )
  }
}

/**
 * Internal error when the compiler returns aliases that don't have corresponding input streams.
 * This should never happen since all aliases come from user declarations.
 */
export class MissingAliasInputsError extends QueryCompilationError {
  constructor(missingAliases: Array<string>) {
    super(
      `Internal error: compiler returned aliases without inputs: ${missingAliases.join(`, `)}. ` +
        `This indicates a bug in query compilation. Please report this issue.`,
    )
  }
}

/**
 * Error thrown when setWindow is called on a collection without an ORDER BY clause.
 */
export class SetWindowRequiresOrderByError extends QueryCompilationError {
  constructor() {
    super(
      `setWindow() can only be called on collections with an ORDER BY clause. ` +
        `Add .orderBy() to your query to enable window movement.`,
    )
  }
}
