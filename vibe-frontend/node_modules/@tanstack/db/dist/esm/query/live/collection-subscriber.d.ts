import { Collection } from '../../collection/index.js';
import { Context, GetResult } from '../builder/types.js';
import { CollectionConfigBuilder } from './collection-config-builder.js';
import { CollectionSubscription } from '../../collection/subscription.js';
export declare class CollectionSubscriber<TContext extends Context, TResult extends object = GetResult<TContext>> {
    private alias;
    private collectionId;
    private collection;
    private collectionConfigBuilder;
    private biggest;
    private subscriptionLoadingPromises;
    private sentToD2Keys;
    constructor(alias: string, collectionId: string, collection: Collection, collectionConfigBuilder: CollectionConfigBuilder<TContext, TResult>);
    subscribe(): CollectionSubscription;
    private subscribeToChanges;
    private sendChangesToPipeline;
    private subscribeToMatchingChanges;
    private subscribeToOrderedChanges;
    loadMoreIfNeeded(subscription: CollectionSubscription): boolean;
    private sendChangesToPipelineWithTracking;
    private loadNextItems;
    private getWhereClauseForAlias;
    private getOrderByInfo;
    private trackSentValues;
}
