import { ProductTour } from '../posthog-product-tours-types';
import { PostHog } from '../posthog-core';
import { EventReceiver } from './event-receiver';
import { createLogger } from './logger';
export declare class ProductTourEventReceiver extends EventReceiver<ProductTour> {
    constructor(instance: PostHog);
    protected _getActivatedKey(): string;
    protected _getShownEventName(): string;
    protected _getItems(callback: (items: ProductTour[]) => void): void;
    protected _cancelPendingItem(itemId: string): void;
    protected _getLogger(): ReturnType<typeof createLogger>;
    protected _isItemPermanentlyIneligible(itemId?: string): boolean;
    getTours(): string[];
}
