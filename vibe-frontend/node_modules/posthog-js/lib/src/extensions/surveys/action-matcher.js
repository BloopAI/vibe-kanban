"use strict";
var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActionMatcher = void 0;
var simple_event_emitter_1 = require("../../utils/simple-event-emitter");
var core_1 = require("@posthog/core");
var property_utils_1 = require("../../utils/property-utils");
var elements_chain_utils_1 = require("../../utils/elements-chain-utils");
var ActionMatcher = /** @class */ (function () {
    function ActionMatcher(instance) {
        var _this = this;
        this._debugEventEmitter = new simple_event_emitter_1.SimpleEventEmitter();
        this._checkStep = function (event, step) {
            return (_this._checkStepEvent(event, step) &&
                _this._checkStepUrl(event, step) &&
                _this._checkStepElement(event, step) &&
                _this._checkStepProperties(event, step));
        };
        this._checkStepEvent = function (event, step) {
            // CHECK CONDITIONS, OTHERWISE SKIPPED
            if ((step === null || step === void 0 ? void 0 : step.event) && (event === null || event === void 0 ? void 0 : event.event) !== (step === null || step === void 0 ? void 0 : step.event)) {
                return false; // EVENT NAME IS A MISMATCH
            }
            return true;
        };
        this._instance = instance;
        this._actionEvents = new Set();
        this._actionRegistry = new Set();
    }
    ActionMatcher.prototype.init = function () {
        var _this = this;
        var _a, _b;
        if (!(0, core_1.isUndefined)((_a = this._instance) === null || _a === void 0 ? void 0 : _a._addCaptureHook)) {
            var matchEventToAction = function (eventName, eventPayload) {
                _this.on(eventName, eventPayload);
            };
            (_b = this._instance) === null || _b === void 0 ? void 0 : _b._addCaptureHook(matchEventToAction);
        }
    };
    ActionMatcher.prototype.register = function (actions) {
        var _this = this;
        var _a, _b, _c;
        if ((0, core_1.isUndefined)((_a = this._instance) === null || _a === void 0 ? void 0 : _a._addCaptureHook)) {
            return;
        }
        actions.forEach(function (action) {
            var _a, _b;
            (_a = _this._actionRegistry) === null || _a === void 0 ? void 0 : _a.add(action);
            (_b = action.steps) === null || _b === void 0 ? void 0 : _b.forEach(function (step) {
                var _a;
                (_a = _this._actionEvents) === null || _a === void 0 ? void 0 : _a.add((step === null || step === void 0 ? void 0 : step.event) || '');
            });
        });
        if ((_b = this._instance) === null || _b === void 0 ? void 0 : _b.autocapture) {
            var selectorsToWatch_1 = new Set();
            actions.forEach(function (action) {
                var _a;
                (_a = action.steps) === null || _a === void 0 ? void 0 : _a.forEach(function (step) {
                    if (step === null || step === void 0 ? void 0 : step.selector) {
                        selectorsToWatch_1.add(step === null || step === void 0 ? void 0 : step.selector);
                    }
                });
            });
            (_c = this._instance) === null || _c === void 0 ? void 0 : _c.autocapture.setElementSelectors(selectorsToWatch_1);
        }
    };
    ActionMatcher.prototype.on = function (eventName, eventPayload) {
        var _this = this;
        var _a;
        if (eventPayload == null || eventName.length == 0) {
            return;
        }
        if (!this._actionEvents.has(eventName) && !this._actionEvents.has(eventPayload === null || eventPayload === void 0 ? void 0 : eventPayload.event)) {
            return;
        }
        if (this._actionRegistry && ((_a = this._actionRegistry) === null || _a === void 0 ? void 0 : _a.size) > 0) {
            this._actionRegistry.forEach(function (action) {
                if (_this._checkAction(eventPayload, action)) {
                    _this._debugEventEmitter.emit('actionCaptured', action.name);
                }
            });
        }
    };
    ActionMatcher.prototype._addActionHook = function (callback) {
        this.onAction('actionCaptured', function (data) { return callback(data); });
    };
    ActionMatcher.prototype._checkAction = function (event, action) {
        var e_1, _a;
        if ((action === null || action === void 0 ? void 0 : action.steps) == null) {
            return false;
        }
        try {
            for (var _b = __values(action.steps), _c = _b.next(); !_c.done; _c = _b.next()) {
                var step = _c.value;
                if (this._checkStep(event, step)) {
                    return true;
                }
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
            }
            finally { if (e_1) throw e_1.error; }
        }
        return false;
    };
    ActionMatcher.prototype.onAction = function (event, cb) {
        return this._debugEventEmitter.on(event, cb);
    };
    ActionMatcher.prototype._checkStepUrl = function (event, step) {
        var _a;
        // CHECK CONDITIONS, OTHERWISE SKIPPED
        if (step === null || step === void 0 ? void 0 : step.url) {
            var eventUrl = (_a = event === null || event === void 0 ? void 0 : event.properties) === null || _a === void 0 ? void 0 : _a.$current_url;
            if (!eventUrl || typeof eventUrl !== 'string') {
                return false;
            }
            if (!(0, elements_chain_utils_1.matchString)(eventUrl, step.url, step.url_matching || 'contains')) {
                return false;
            }
        }
        return true;
    };
    ActionMatcher.prototype._checkStepElement = function (event, step) {
        if (!this._checkStepHref(event, step))
            return false;
        if (!this._checkStepText(event, step))
            return false;
        if (!this._checkStepSelector(event, step))
            return false;
        return true;
    };
    ActionMatcher.prototype._checkStepHref = function (event, step) {
        var _a;
        if (!(step === null || step === void 0 ? void 0 : step.href))
            return true;
        var elements = this._getElementsList(event);
        if (elements.length > 0) {
            return elements.some(function (el) { return (0, elements_chain_utils_1.matchString)(el.href, step.href, step.href_matching || 'exact'); });
        }
        var chain = ((_a = event === null || event === void 0 ? void 0 : event.properties) === null || _a === void 0 ? void 0 : _a.$elements_chain) || '';
        if (chain) {
            return (0, elements_chain_utils_1.matchString)((0, elements_chain_utils_1.extractHref)(chain), step.href, step.href_matching || 'exact');
        }
        return false;
    };
    ActionMatcher.prototype._checkStepText = function (event, step) {
        var _a;
        if (!(step === null || step === void 0 ? void 0 : step.text))
            return true;
        var elements = this._getElementsList(event);
        if (elements.length > 0) {
            return elements.some(function (el) {
                return (0, elements_chain_utils_1.matchString)(el.text, step.text, step.text_matching || 'exact') ||
                    (0, elements_chain_utils_1.matchString)(el.$el_text, step.text, step.text_matching || 'exact');
            });
        }
        var chain = ((_a = event === null || event === void 0 ? void 0 : event.properties) === null || _a === void 0 ? void 0 : _a.$elements_chain) || '';
        if (chain) {
            return (0, elements_chain_utils_1.matchTexts)((0, elements_chain_utils_1.extractTexts)(chain), step.text, step.text_matching || 'exact');
        }
        return false;
    };
    ActionMatcher.prototype._checkStepSelector = function (event, step) {
        var _a, _b;
        if (!(step === null || step === void 0 ? void 0 : step.selector))
            return true;
        // check exact match on $element_selectors from autocapture
        var elementSelectors = (_a = event === null || event === void 0 ? void 0 : event.properties) === null || _a === void 0 ? void 0 : _a.$element_selectors;
        if (elementSelectors === null || elementSelectors === void 0 ? void 0 : elementSelectors.includes(step.selector)) {
            return true;
        }
        // check against compiled regex
        var chain = ((_b = event === null || event === void 0 ? void 0 : event.properties) === null || _b === void 0 ? void 0 : _b.$elements_chain) || '';
        if (step.selector_regex && chain) {
            try {
                return new RegExp(step.selector_regex).test(chain);
            }
            catch (_c) {
                return false;
            }
        }
        return false;
    };
    ActionMatcher.prototype._getElementsList = function (event) {
        var _a;
        if (((_a = event === null || event === void 0 ? void 0 : event.properties) === null || _a === void 0 ? void 0 : _a.$elements) == null) {
            return [];
        }
        return event === null || event === void 0 ? void 0 : event.properties.$elements;
    };
    ActionMatcher.prototype._checkStepProperties = function (event, step) {
        if (!(step === null || step === void 0 ? void 0 : step.properties) || step.properties.length === 0) {
            return true;
        }
        // transform to match same property format as normal events
        var propertyFilters = step.properties.reduce(function (acc, filter) {
            var values = (0, core_1.isArray)(filter.value)
                ? filter.value.map(String)
                : filter.value != null
                    ? [String(filter.value)]
                    : [];
            acc[filter.key] = {
                values: values,
                operator: (filter.operator || 'exact'),
            };
            return acc;
        }, {});
        return (0, property_utils_1.matchPropertyFilters)(propertyFilters, event === null || event === void 0 ? void 0 : event.properties);
    };
    return ActionMatcher;
}());
exports.ActionMatcher = ActionMatcher;
//# sourceMappingURL=action-matcher.js.map