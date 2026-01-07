import { Survey } from '../posthog-surveys-types';
import { PostHog } from '../posthog-core';
import { EventReceiver } from './event-receiver';
import { createLogger } from './logger';
export declare class SurveyEventReceiver extends EventReceiver<Survey> {
    constructor(instance: PostHog);
    protected _getActivatedKey(): string;
    protected _getShownEventName(): string;
    protected _getItems(callback: (items: Survey[]) => void): void;
    protected _cancelPendingItem(itemId: string): void;
    protected _getLogger(): ReturnType<typeof createLogger>;
    protected _isItemPermanentlyIneligible(): boolean;
    getSurveys(): string[];
    getEventToSurveys(): Map<string, string[]>;
}
