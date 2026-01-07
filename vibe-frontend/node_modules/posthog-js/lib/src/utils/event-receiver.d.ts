import { SurveyActionType, SurveyEventWithFilters } from '../posthog-surveys-types';
import { ActionMatcher } from '../extensions/surveys/action-matcher';
import { PostHog } from '../posthog-core';
import { CaptureResult } from '../types';
import { createLogger } from './logger';
/**
 * Interface for items that can be triggered by events/actions.
 * Both Survey and ProductTour implement this interface.
 */
export interface EventTriggerable {
    id: string;
    conditions?: {
        events?: {
            repeatedActivation?: boolean;
            values: SurveyEventWithFilters[];
        } | null;
        cancelEvents?: {
            values: SurveyEventWithFilters[];
        } | null;
        actions?: {
            values: SurveyActionType[];
        } | null;
    } | null;
}
/**
 * Abstract base class for receiving events and matching them to triggerable items.
 * Subclasses implement type-specific behavior for surveys and product tours.
 */
export declare abstract class EventReceiver<T extends EventTriggerable> {
    protected _eventToItems: Map<string, string[]>;
    protected _cancelEventToItems: Map<string, string[]>;
    protected readonly _actionToItems: Map<string, string[]>;
    protected _actionMatcher?: ActionMatcher | null;
    protected readonly _instance?: PostHog;
    constructor(instance: PostHog);
    protected abstract _getActivatedKey(): string;
    protected abstract _getShownEventName(): string;
    protected abstract _getItems(callback: (items: T[]) => void): void;
    protected abstract _cancelPendingItem(itemId: string): void;
    protected abstract _getLogger(): ReturnType<typeof createLogger>;
    /** Check if item is permanently ineligible (e.g. completed/dismissed). Skip adding to activated list. */
    protected abstract _isItemPermanentlyIneligible(itemId?: string): boolean;
    private _doesEventMatchFilter;
    private _buildEventToItemMap;
    /**
     * build a map of (Event1) => [Item1, Item2, Item3]
     * used for items that should be [activated|cancelled] by Event1
     */
    private _getMatchingItems;
    register(items: T[]): void;
    private _setupActionBasedItems;
    private _setupEventBasedItems;
    onEvent(event: string, eventPayload?: CaptureResult): void;
    onAction(actionName: string): void;
    private _updateActivatedItems;
    getActivatedIds(): string[];
    getEventToItemsMap(): Map<string, string[]>;
    _getActionMatcher(): ActionMatcher | null | undefined;
}
