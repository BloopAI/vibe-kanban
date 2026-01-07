import { CollectionImpl } from './index.js';
import { StandardSchemaV1 } from '@standard-schema/spec';
import { CollectionConfig, InsertConfig, OperationConfig, Transaction as TransactionType, UtilsRecord, WritableDeep } from '../types.cjs';
import { CollectionLifecycleManager } from './lifecycle.cjs';
import { CollectionStateManager } from './state.cjs';
export declare class CollectionMutationsManager<TOutput extends object = Record<string, unknown>, TKey extends string | number = string | number, TUtils extends UtilsRecord = {}, TSchema extends StandardSchemaV1 = StandardSchemaV1, TInput extends object = TOutput> {
    private lifecycle;
    private state;
    private collection;
    private config;
    private id;
    constructor(config: CollectionConfig<TOutput, TKey, TSchema>, id: string);
    setDeps(deps: {
        lifecycle: CollectionLifecycleManager<TOutput, TKey, TSchema, TInput>;
        state: CollectionStateManager<TOutput, TKey, TSchema, TInput>;
        collection: CollectionImpl<TOutput, TKey, TUtils, TSchema, TInput>;
    }): void;
    private ensureStandardSchema;
    validateData(data: unknown, type: `insert` | `update`, key?: TKey): TOutput | never;
    generateGlobalKey(key: any, item: any): string;
    /**
     * Inserts one or more items into the collection
     */
    insert: (data: TInput | Array<TInput>, config?: InsertConfig) => TransactionType<Record<string, unknown>>;
    /**
     * Updates one or more items in the collection using a callback function
     */
    update(keys: (TKey | unknown) | Array<TKey | unknown>, configOrCallback: ((draft: WritableDeep<TInput>) => void) | ((drafts: Array<WritableDeep<TInput>>) => void) | OperationConfig, maybeCallback?: ((draft: WritableDeep<TInput>) => void) | ((drafts: Array<WritableDeep<TInput>>) => void)): TransactionType<Record<string, unknown>>;
    /**
     * Deletes one or more items from the collection
     */
    delete: (keys: Array<TKey> | TKey, config?: OperationConfig) => TransactionType<any>;
}
