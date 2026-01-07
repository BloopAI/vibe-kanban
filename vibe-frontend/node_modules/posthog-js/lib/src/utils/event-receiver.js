"use strict";
var __read = (this && this.__read) || function (o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventReceiver = void 0;
var posthog_surveys_types_1 = require("../posthog-surveys-types");
var action_matcher_1 = require("../extensions/surveys/action-matcher");
var property_utils_1 = require("./property-utils");
var core_1 = require("@posthog/core");
/**
 * Abstract base class for receiving events and matching them to triggerable items.
 * Subclasses implement type-specific behavior for surveys and product tours.
 */
var EventReceiver = /** @class */ (function () {
    function EventReceiver(instance) {
        this._instance = instance;
        this._eventToItems = new Map();
        this._cancelEventToItems = new Map();
        this._actionToItems = new Map();
    }
    EventReceiver.prototype._doesEventMatchFilter = function (eventConfig, eventPayload) {
        if (!eventConfig) {
            return false;
        }
        return (0, property_utils_1.matchPropertyFilters)(eventConfig.propertyFilters, eventPayload === null || eventPayload === void 0 ? void 0 : eventPayload.properties);
    };
    EventReceiver.prototype._buildEventToItemMap = function (items, conditionField) {
        var map = new Map();
        items.forEach(function (item) {
            var _a, _b, _c;
            (_c = (_b = (_a = item.conditions) === null || _a === void 0 ? void 0 : _a[conditionField]) === null || _b === void 0 ? void 0 : _b.values) === null || _c === void 0 ? void 0 : _c.forEach(function (event) {
                if (event === null || event === void 0 ? void 0 : event.name) {
                    var existing = map.get(event.name) || [];
                    existing.push(item.id);
                    map.set(event.name, existing);
                }
            });
        });
        return map;
    };
    /**
     * build a map of (Event1) => [Item1, Item2, Item3]
     * used for items that should be [activated|cancelled] by Event1
     */
    EventReceiver.prototype._getMatchingItems = function (eventName, eventPayload, conditionField) {
        var _this = this;
        var itemIdMap = conditionField === posthog_surveys_types_1.SurveyEventType.Activation ? this._eventToItems : this._cancelEventToItems;
        var itemIds = itemIdMap.get(eventName);
        var items = [];
        this._getItems(function (allItems) {
            items = allItems.filter(function (item) { return itemIds === null || itemIds === void 0 ? void 0 : itemIds.includes(item.id); });
        });
        return items.filter(function (item) {
            var _a, _b, _c;
            var eventConfig = (_c = (_b = (_a = item.conditions) === null || _a === void 0 ? void 0 : _a[conditionField]) === null || _b === void 0 ? void 0 : _b.values) === null || _c === void 0 ? void 0 : _c.find(function (e) { return e.name === eventName; });
            return _this._doesEventMatchFilter(eventConfig, eventPayload);
        });
    };
    EventReceiver.prototype.register = function (items) {
        var _a;
        if ((0, core_1.isUndefined)((_a = this._instance) === null || _a === void 0 ? void 0 : _a._addCaptureHook)) {
            return;
        }
        this._setupEventBasedItems(items);
        this._setupActionBasedItems(items);
    };
    EventReceiver.prototype._setupActionBasedItems = function (items) {
        var _this = this;
        var actionBasedItems = items.filter(function (item) { var _a, _b, _c, _d; return ((_a = item.conditions) === null || _a === void 0 ? void 0 : _a.actions) && ((_d = (_c = (_b = item.conditions) === null || _b === void 0 ? void 0 : _b.actions) === null || _c === void 0 ? void 0 : _c.values) === null || _d === void 0 ? void 0 : _d.length) > 0; });
        if (actionBasedItems.length === 0) {
            return;
        }
        if (this._actionMatcher == null) {
            this._actionMatcher = new action_matcher_1.ActionMatcher(this._instance);
            this._actionMatcher.init();
            // match any actions to its corresponding item.
            var matchActionToItem = function (actionName) {
                _this.onAction(actionName);
            };
            this._actionMatcher._addActionHook(matchActionToItem);
        }
        actionBasedItems.forEach(function (item) {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
            if (item.conditions &&
                ((_a = item.conditions) === null || _a === void 0 ? void 0 : _a.actions) &&
                ((_c = (_b = item.conditions) === null || _b === void 0 ? void 0 : _b.actions) === null || _c === void 0 ? void 0 : _c.values) &&
                ((_f = (_e = (_d = item.conditions) === null || _d === void 0 ? void 0 : _d.actions) === null || _e === void 0 ? void 0 : _e.values) === null || _f === void 0 ? void 0 : _f.length) > 0) {
                // register the known set of actions with
                // the action-matcher so it can match
                // events to actions
                (_g = _this._actionMatcher) === null || _g === void 0 ? void 0 : _g.register(item.conditions.actions.values);
                // maintain a mapping of (Action1) => [Item1, Item2, Item3]
                // where Items 1-3 are all activated by Action1
                (_k = (_j = (_h = item.conditions) === null || _h === void 0 ? void 0 : _h.actions) === null || _j === void 0 ? void 0 : _j.values) === null || _k === void 0 ? void 0 : _k.forEach(function (action) {
                    if (action && action.name) {
                        var knownItems = _this._actionToItems.get(action.name);
                        if (knownItems) {
                            knownItems.push(item.id);
                        }
                        _this._actionToItems.set(action.name, knownItems || [item.id]);
                    }
                });
            }
        });
    };
    EventReceiver.prototype._setupEventBasedItems = function (items) {
        var _this = this;
        var _a;
        var eventBasedItems = items.filter(function (item) { var _a, _b, _c, _d; return ((_a = item.conditions) === null || _a === void 0 ? void 0 : _a.events) && ((_d = (_c = (_b = item.conditions) === null || _b === void 0 ? void 0 : _b.events) === null || _c === void 0 ? void 0 : _c.values) === null || _d === void 0 ? void 0 : _d.length) > 0; });
        var itemsWithCancelEvents = items.filter(function (item) { var _a, _b, _c, _d; return ((_a = item.conditions) === null || _a === void 0 ? void 0 : _a.cancelEvents) && ((_d = (_c = (_b = item.conditions) === null || _b === void 0 ? void 0 : _b.cancelEvents) === null || _c === void 0 ? void 0 : _c.values) === null || _d === void 0 ? void 0 : _d.length) > 0; });
        if (eventBasedItems.length === 0 && itemsWithCancelEvents.length === 0) {
            return;
        }
        // match any events to its corresponding item.
        var matchEventToItem = function (eventName, eventPayload) {
            _this.onEvent(eventName, eventPayload);
        };
        (_a = this._instance) === null || _a === void 0 ? void 0 : _a._addCaptureHook(matchEventToItem);
        this._eventToItems = this._buildEventToItemMap(items, posthog_surveys_types_1.SurveyEventType.Activation);
        this._cancelEventToItems = this._buildEventToItemMap(items, posthog_surveys_types_1.SurveyEventType.Cancellation);
    };
    EventReceiver.prototype.onEvent = function (event, eventPayload) {
        var _this = this;
        var _a, _b, _c, _d;
        var logger = this._getLogger();
        var activatedKey = this._getActivatedKey();
        var shownEventName = this._getShownEventName();
        var existingActivatedItems = ((_b = (_a = this._instance) === null || _a === void 0 ? void 0 : _a.persistence) === null || _b === void 0 ? void 0 : _b.props[activatedKey]) || [];
        if (shownEventName === event && eventPayload && existingActivatedItems.length > 0) {
            // remove item from activatedItems here.
            logger.info('event matched, removing item from activated items', {
                event: event,
                eventPayload: eventPayload,
                existingActivatedItems: existingActivatedItems,
            });
            var itemId = ((_c = eventPayload === null || eventPayload === void 0 ? void 0 : eventPayload.properties) === null || _c === void 0 ? void 0 : _c.$survey_id) || ((_d = eventPayload === null || eventPayload === void 0 ? void 0 : eventPayload.properties) === null || _d === void 0 ? void 0 : _d.$product_tour_id);
            if (itemId) {
                var index = existingActivatedItems.indexOf(itemId);
                if (index >= 0) {
                    existingActivatedItems.splice(index, 1);
                    this._updateActivatedItems(existingActivatedItems);
                }
            }
            return;
        }
        // check if this event should cancel any pending items
        if (this._cancelEventToItems.has(event)) {
            var itemsToCancel = this._getMatchingItems(event, eventPayload, posthog_surveys_types_1.SurveyEventType.Cancellation);
            if (itemsToCancel.length > 0) {
                logger.info('cancel event matched, cancelling items', {
                    event: event,
                    itemsToCancel: itemsToCancel.map(function (s) { return s.id; }),
                });
                itemsToCancel.forEach(function (item) {
                    // remove from activated items
                    var index = existingActivatedItems.indexOf(item.id);
                    if (index >= 0) {
                        existingActivatedItems.splice(index, 1);
                    }
                    // cancel any pending timeout for this item
                    _this._cancelPendingItem(item.id);
                });
                this._updateActivatedItems(existingActivatedItems);
            }
        }
        // if the event is not in the eventToItems map, nothing else to do
        if (!this._eventToItems.has(event)) {
            return;
        }
        logger.info('event name matched', {
            event: event,
            eventPayload: eventPayload,
            items: this._eventToItems.get(event),
        });
        var matchedItems = this._getMatchingItems(event, eventPayload, posthog_surveys_types_1.SurveyEventType.Activation);
        this._updateActivatedItems(existingActivatedItems.concat(matchedItems.map(function (item) { return item.id; }) || []));
    };
    EventReceiver.prototype.onAction = function (actionName) {
        var _a, _b;
        var activatedKey = this._getActivatedKey();
        var existingActivatedItems = ((_b = (_a = this._instance) === null || _a === void 0 ? void 0 : _a.persistence) === null || _b === void 0 ? void 0 : _b.props[activatedKey]) || [];
        if (this._actionToItems.has(actionName)) {
            this._updateActivatedItems(existingActivatedItems.concat(this._actionToItems.get(actionName) || []));
        }
    };
    EventReceiver.prototype._updateActivatedItems = function (activatedItems) {
        var _a;
        var _this = this;
        var _b, _c;
        var logger = this._getLogger();
        var activatedKey = this._getActivatedKey();
        // Filter out permanently ineligible items and remove duplicates
        var eligibleItems = __spreadArray([], __read(new Set(activatedItems)), false).filter(function (itemId) { return !_this._isItemPermanentlyIneligible(itemId); });
        logger.info('updating activated items', {
            activatedItems: eligibleItems,
        });
        (_c = (_b = this._instance) === null || _b === void 0 ? void 0 : _b.persistence) === null || _c === void 0 ? void 0 : _c.register((_a = {},
            _a[activatedKey] = eligibleItems,
            _a));
    };
    EventReceiver.prototype.getActivatedIds = function () {
        var _a, _b;
        var activatedKey = this._getActivatedKey();
        var existingActivatedItems = (_b = (_a = this._instance) === null || _a === void 0 ? void 0 : _a.persistence) === null || _b === void 0 ? void 0 : _b.props[activatedKey];
        return existingActivatedItems ? existingActivatedItems : [];
    };
    EventReceiver.prototype.getEventToItemsMap = function () {
        return this._eventToItems;
    };
    EventReceiver.prototype._getActionMatcher = function () {
        return this._actionMatcher;
    };
    return EventReceiver;
}());
exports.EventReceiver = EventReceiver;
//# sourceMappingURL=event-receiver.js.map