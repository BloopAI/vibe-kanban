import { withArrayChangeTracking, withChangeTracking } from '../proxy'
import { createTransaction, getActiveTransaction } from '../transactions'
import {
  DeleteKeyNotFoundError,
  DuplicateKeyError,
  InvalidKeyError,
  InvalidSchemaError,
  KeyUpdateNotAllowedError,
  MissingDeleteHandlerError,
  MissingInsertHandlerError,
  MissingUpdateArgumentError,
  MissingUpdateHandlerError,
  NoKeysPassedToDeleteError,
  NoKeysPassedToUpdateError,
  SchemaMustBeSynchronousError,
  SchemaValidationError,
  UndefinedKeyError,
  UpdateKeyNotFoundError,
} from '../errors'
import type { Collection, CollectionImpl } from './index.js'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type {
  CollectionConfig,
  InsertConfig,
  OperationConfig,
  PendingMutation,
  StandardSchema,
  Transaction as TransactionType,
  TransactionWithMutations,
  UtilsRecord,
  WritableDeep,
} from '../types'
import type { CollectionLifecycleManager } from './lifecycle'
import type { CollectionStateManager } from './state'

export class CollectionMutationsManager<
  TOutput extends object = Record<string, unknown>,
  TKey extends string | number = string | number,
  TUtils extends UtilsRecord = {},
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
  TInput extends object = TOutput,
> {
  private lifecycle!: CollectionLifecycleManager<TOutput, TKey, TSchema, TInput>
  private state!: CollectionStateManager<TOutput, TKey, TSchema, TInput>
  private collection!: CollectionImpl<TOutput, TKey, TUtils, TSchema, TInput>
  private config!: CollectionConfig<TOutput, TKey, TSchema>
  private id: string

  constructor(config: CollectionConfig<TOutput, TKey, TSchema>, id: string) {
    this.id = id
    this.config = config
  }

  setDeps(deps: {
    lifecycle: CollectionLifecycleManager<TOutput, TKey, TSchema, TInput>
    state: CollectionStateManager<TOutput, TKey, TSchema, TInput>
    collection: CollectionImpl<TOutput, TKey, TUtils, TSchema, TInput>
  }) {
    this.lifecycle = deps.lifecycle
    this.state = deps.state
    this.collection = deps.collection
  }

  private ensureStandardSchema(schema: unknown): StandardSchema<TOutput> {
    // If the schema already implements the standard-schema interface, return it
    if (schema && `~standard` in (schema as {})) {
      return schema as StandardSchema<TOutput>
    }

    throw new InvalidSchemaError()
  }

  public validateData(
    data: unknown,
    type: `insert` | `update`,
    key?: TKey,
  ): TOutput | never {
    if (!this.config.schema) return data as TOutput

    const standardSchema = this.ensureStandardSchema(this.config.schema)

    // For updates, we need to merge with the existing data before validation
    if (type === `update` && key) {
      // Get the existing data for this key
      const existingData = this.state.get(key)

      if (
        existingData &&
        data &&
        typeof data === `object` &&
        typeof existingData === `object`
      ) {
        // Merge the update with the existing data
        const mergedData = Object.assign({}, existingData, data)

        // Validate the merged data
        const result = standardSchema[`~standard`].validate(mergedData)

        // Ensure validation is synchronous
        if (result instanceof Promise) {
          throw new SchemaMustBeSynchronousError()
        }

        // If validation fails, throw a SchemaValidationError with the issues
        if (`issues` in result && result.issues) {
          const typedIssues = result.issues.map((issue) => ({
            message: issue.message,
            path: issue.path?.map((p) => String(p)),
          }))
          throw new SchemaValidationError(type, typedIssues)
        }

        // Extract only the modified keys from the validated result
        const validatedMergedData = result.value as TOutput
        const modifiedKeys = Object.keys(data)
        const extractedChanges = Object.fromEntries(
          modifiedKeys.map((k) => [k, validatedMergedData[k as keyof TOutput]]),
        ) as TOutput

        return extractedChanges
      }
    }

    // For inserts or updates without existing data, validate the data directly
    const result = standardSchema[`~standard`].validate(data)

    // Ensure validation is synchronous
    if (result instanceof Promise) {
      throw new SchemaMustBeSynchronousError()
    }

    // If validation fails, throw a SchemaValidationError with the issues
    if (`issues` in result && result.issues) {
      const typedIssues = result.issues.map((issue) => ({
        message: issue.message,
        path: issue.path?.map((p) => String(p)),
      }))
      throw new SchemaValidationError(type, typedIssues)
    }

    return result.value as TOutput
  }

  public generateGlobalKey(key: any, item: any): string {
    if (typeof key !== `string` && typeof key !== `number`) {
      // Preserve specific error for undefined keys
      if (typeof key === `undefined`) {
        throw new UndefinedKeyError(item)
      }
      throw new InvalidKeyError(key, item)
    }

    return `KEY::${this.id}/${key}`
  }

  /**
   * Inserts one or more items into the collection
   */
  insert = (data: TInput | Array<TInput>, config?: InsertConfig) => {
    this.lifecycle.validateCollectionUsable(`insert`)
    const state = this.state
    const ambientTransaction = getActiveTransaction()

    // If no ambient transaction exists, check for an onInsert handler early
    if (!ambientTransaction && !this.config.onInsert) {
      throw new MissingInsertHandlerError()
    }

    const items = Array.isArray(data) ? data : [data]
    const mutations: Array<PendingMutation<TOutput>> = []
    const keysInCurrentBatch = new Set<TKey>()

    // Create mutations for each item
    items.forEach((item) => {
      // Validate the data against the schema if one exists
      const validatedData = this.validateData(item, `insert`)

      // Check if an item with this ID already exists in the collection or in the current batch
      const key = this.config.getKey(validatedData)
      if (this.state.has(key) || keysInCurrentBatch.has(key)) {
        throw new DuplicateKeyError(key)
      }
      keysInCurrentBatch.add(key)
      const globalKey = this.generateGlobalKey(key, item)

      const mutation: PendingMutation<TOutput, `insert`> = {
        mutationId: crypto.randomUUID(),
        original: {},
        modified: validatedData,
        // Pick the values from validatedData based on what's passed in - this is for cases
        // where a schema has default values. The validated data has the extra default
        // values but for changes, we just want to show the data that was actually passed in.
        changes: Object.fromEntries(
          Object.keys(item).map((k) => [
            k,
            validatedData[k as keyof typeof validatedData],
          ]),
        ) as TInput,
        globalKey,
        key,
        metadata: config?.metadata as unknown,
        syncMetadata: this.config.sync.getSyncMetadata?.() || {},
        optimistic: config?.optimistic ?? true,
        type: `insert`,
        createdAt: new Date(),
        updatedAt: new Date(),
        collection: this.collection,
      }

      mutations.push(mutation)
    })

    // If an ambient transaction exists, use it
    if (ambientTransaction) {
      ambientTransaction.applyMutations(mutations)

      state.transactions.set(ambientTransaction.id, ambientTransaction)
      state.scheduleTransactionCleanup(ambientTransaction)
      state.recomputeOptimisticState(true)

      return ambientTransaction
    } else {
      // Create a new transaction with a mutation function that calls the onInsert handler
      const directOpTransaction = createTransaction<TOutput>({
        mutationFn: async (params) => {
          // Call the onInsert handler with the transaction and collection
          return await this.config.onInsert!({
            transaction:
              params.transaction as unknown as TransactionWithMutations<
                TOutput,
                `insert`
              >,
            collection: this.collection as unknown as Collection<TOutput, TKey>,
          })
        },
      })

      // Apply mutations to the new transaction
      directOpTransaction.applyMutations(mutations)
      // Errors still reject tx.isPersisted.promise; this catch only prevents global unhandled rejections
      directOpTransaction.commit().catch(() => undefined)

      // Add the transaction to the collection's transactions store
      state.transactions.set(directOpTransaction.id, directOpTransaction)
      state.scheduleTransactionCleanup(directOpTransaction)
      state.recomputeOptimisticState(true)

      return directOpTransaction
    }
  }

  /**
   * Updates one or more items in the collection using a callback function
   */
  update(
    keys: (TKey | unknown) | Array<TKey | unknown>,
    configOrCallback:
      | ((draft: WritableDeep<TInput>) => void)
      | ((drafts: Array<WritableDeep<TInput>>) => void)
      | OperationConfig,
    maybeCallback?:
      | ((draft: WritableDeep<TInput>) => void)
      | ((drafts: Array<WritableDeep<TInput>>) => void),
  ) {
    if (typeof keys === `undefined`) {
      throw new MissingUpdateArgumentError()
    }

    const state = this.state
    this.lifecycle.validateCollectionUsable(`update`)

    const ambientTransaction = getActiveTransaction()

    // If no ambient transaction exists, check for an onUpdate handler early
    if (!ambientTransaction && !this.config.onUpdate) {
      throw new MissingUpdateHandlerError()
    }

    const isArray = Array.isArray(keys)
    const keysArray = isArray ? keys : [keys]

    if (isArray && keysArray.length === 0) {
      throw new NoKeysPassedToUpdateError()
    }

    const callback =
      typeof configOrCallback === `function` ? configOrCallback : maybeCallback!
    const config =
      typeof configOrCallback === `function` ? {} : configOrCallback

    // Get the current objects or empty objects if they don't exist
    const currentObjects = keysArray.map((key) => {
      const item = this.state.get(key)
      if (!item) {
        throw new UpdateKeyNotFoundError(key)
      }

      return item
    }) as unknown as Array<TInput>

    let changesArray
    if (isArray) {
      // Use the proxy to track changes for all objects
      changesArray = withArrayChangeTracking(
        currentObjects,
        callback as (draft: Array<TInput>) => void,
      )
    } else {
      const result = withChangeTracking(
        currentObjects[0]!,
        callback as (draft: TInput) => void,
      )
      changesArray = [result]
    }

    // Create mutations for each object that has changes
    const mutations: Array<
      PendingMutation<
        TOutput,
        `update`,
        CollectionImpl<TOutput, TKey, TUtils, TSchema, TInput>
      >
    > = keysArray
      .map((key, index) => {
        const itemChanges = changesArray[index] // User-provided changes for this specific item

        // Skip items with no changes
        if (!itemChanges || Object.keys(itemChanges).length === 0) {
          return null
        }

        const originalItem = currentObjects[index] as unknown as TOutput
        // Validate the user-provided changes for this item
        const validatedUpdatePayload = this.validateData(
          itemChanges,
          `update`,
          key,
        )

        // Construct the full modified item by applying the validated update payload to the original item
        const modifiedItem = Object.assign(
          {},
          originalItem,
          validatedUpdatePayload,
        )

        // Check if the ID of the item is being changed
        const originalItemId = this.config.getKey(originalItem)
        const modifiedItemId = this.config.getKey(modifiedItem)

        if (originalItemId !== modifiedItemId) {
          throw new KeyUpdateNotAllowedError(originalItemId, modifiedItemId)
        }

        const globalKey = this.generateGlobalKey(modifiedItemId, modifiedItem)

        return {
          mutationId: crypto.randomUUID(),
          original: originalItem,
          modified: modifiedItem,
          // Pick the values from modifiedItem based on what's passed in - this is for cases
          // where a schema has default values or transforms. The modified data has the extra
          // default or transformed values but for changes, we just want to show the data that
          // was actually passed in.
          changes: Object.fromEntries(
            Object.keys(itemChanges).map((k) => [
              k,
              modifiedItem[k as keyof typeof modifiedItem],
            ]),
          ) as TInput,
          globalKey,
          key,
          metadata: config.metadata as unknown,
          syncMetadata: (state.syncedMetadata.get(key) || {}) as Record<
            string,
            unknown
          >,
          optimistic: config.optimistic ?? true,
          type: `update`,
          createdAt: new Date(),
          updatedAt: new Date(),
          collection: this.collection,
        }
      })
      .filter(Boolean) as Array<
      PendingMutation<
        TOutput,
        `update`,
        CollectionImpl<TOutput, TKey, TUtils, TSchema, TInput>
      >
    >

    // If no changes were made, return an empty transaction early
    if (mutations.length === 0) {
      const emptyTransaction = createTransaction({
        mutationFn: async () => {},
      })
      // Errors still propagate through tx.isPersisted.promise; suppress the background commit from warning
      emptyTransaction.commit().catch(() => undefined)
      // Schedule cleanup for empty transaction
      state.scheduleTransactionCleanup(emptyTransaction)
      return emptyTransaction
    }

    // If an ambient transaction exists, use it
    if (ambientTransaction) {
      ambientTransaction.applyMutations(mutations)

      state.transactions.set(ambientTransaction.id, ambientTransaction)
      state.scheduleTransactionCleanup(ambientTransaction)
      state.recomputeOptimisticState(true)

      return ambientTransaction
    }

    // No need to check for onUpdate handler here as we've already checked at the beginning

    // Create a new transaction with a mutation function that calls the onUpdate handler
    const directOpTransaction = createTransaction<TOutput>({
      mutationFn: async (params) => {
        // Call the onUpdate handler with the transaction and collection
        return this.config.onUpdate!({
          transaction:
            params.transaction as unknown as TransactionWithMutations<
              TOutput,
              `update`
            >,
          collection: this.collection as unknown as Collection<TOutput, TKey>,
        })
      },
    })

    // Apply mutations to the new transaction
    directOpTransaction.applyMutations(mutations)
    // Errors still hit tx.isPersisted.promise; avoid leaking an unhandled rejection from the fire-and-forget commit
    directOpTransaction.commit().catch(() => undefined)

    // Add the transaction to the collection's transactions store

    state.transactions.set(directOpTransaction.id, directOpTransaction)
    state.scheduleTransactionCleanup(directOpTransaction)
    state.recomputeOptimisticState(true)

    return directOpTransaction
  }

  /**
   * Deletes one or more items from the collection
   */
  delete = (
    keys: Array<TKey> | TKey,
    config?: OperationConfig,
  ): TransactionType<any> => {
    const state = this.state
    this.lifecycle.validateCollectionUsable(`delete`)

    const ambientTransaction = getActiveTransaction()

    // If no ambient transaction exists, check for an onDelete handler early
    if (!ambientTransaction && !this.config.onDelete) {
      throw new MissingDeleteHandlerError()
    }

    if (Array.isArray(keys) && keys.length === 0) {
      throw new NoKeysPassedToDeleteError()
    }

    const keysArray = Array.isArray(keys) ? keys : [keys]
    const mutations: Array<
      PendingMutation<
        TOutput,
        `delete`,
        CollectionImpl<TOutput, TKey, TUtils, TSchema, TInput>
      >
    > = []

    for (const key of keysArray) {
      if (!this.state.has(key)) {
        throw new DeleteKeyNotFoundError(key)
      }
      const globalKey = this.generateGlobalKey(key, this.state.get(key)!)
      const mutation: PendingMutation<
        TOutput,
        `delete`,
        CollectionImpl<TOutput, TKey, TUtils, TSchema, TInput>
      > = {
        mutationId: crypto.randomUUID(),
        original: this.state.get(key)!,
        modified: this.state.get(key)!,
        changes: this.state.get(key)!,
        globalKey,
        key,
        metadata: config?.metadata as unknown,
        syncMetadata: (state.syncedMetadata.get(key) || {}) as Record<
          string,
          unknown
        >,
        optimistic: config?.optimistic ?? true,
        type: `delete`,
        createdAt: new Date(),
        updatedAt: new Date(),
        collection: this.collection,
      }

      mutations.push(mutation)
    }

    // If an ambient transaction exists, use it
    if (ambientTransaction) {
      ambientTransaction.applyMutations(mutations)

      state.transactions.set(ambientTransaction.id, ambientTransaction)
      state.scheduleTransactionCleanup(ambientTransaction)
      state.recomputeOptimisticState(true)

      return ambientTransaction
    }

    // Create a new transaction with a mutation function that calls the onDelete handler
    const directOpTransaction = createTransaction<TOutput>({
      autoCommit: true,
      mutationFn: async (params) => {
        // Call the onDelete handler with the transaction and collection
        return this.config.onDelete!({
          transaction:
            params.transaction as unknown as TransactionWithMutations<
              TOutput,
              `delete`
            >,
          collection: this.collection as unknown as Collection<TOutput, TKey>,
        })
      },
    })

    // Apply mutations to the new transaction
    directOpTransaction.applyMutations(mutations)
    // Errors still reject tx.isPersisted.promise; silence the internal commit promise to prevent test noise
    directOpTransaction.commit().catch(() => undefined)

    state.transactions.set(directOpTransaction.id, directOpTransaction)
    state.scheduleTransactionCleanup(directOpTransaction)
    state.recomputeOptimisticState(true)

    return directOpTransaction
  }
}
