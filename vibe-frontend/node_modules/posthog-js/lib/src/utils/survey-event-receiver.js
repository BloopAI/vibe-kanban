"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SurveyEventReceiver = void 0;
var constants_1 = require("../constants");
var posthog_surveys_types_1 = require("../posthog-surveys-types");
var survey_utils_1 = require("./survey-utils");
var event_receiver_1 = require("./event-receiver");
var SurveyEventReceiver = /** @class */ (function (_super) {
    __extends(SurveyEventReceiver, _super);
    function SurveyEventReceiver(instance) {
        return _super.call(this, instance) || this;
    }
    SurveyEventReceiver.prototype._getActivatedKey = function () {
        return constants_1.SURVEYS_ACTIVATED;
    };
    SurveyEventReceiver.prototype._getShownEventName = function () {
        return posthog_surveys_types_1.SurveyEventName.SHOWN;
    };
    SurveyEventReceiver.prototype._getItems = function (callback) {
        var _a;
        (_a = this._instance) === null || _a === void 0 ? void 0 : _a.getSurveys(callback);
    };
    SurveyEventReceiver.prototype._cancelPendingItem = function (itemId) {
        var _a;
        (_a = this._instance) === null || _a === void 0 ? void 0 : _a.cancelPendingSurvey(itemId);
    };
    SurveyEventReceiver.prototype._getLogger = function () {
        return survey_utils_1.SURVEY_LOGGER;
    };
    SurveyEventReceiver.prototype._isItemPermanentlyIneligible = function () {
        // Surveys have complex eligibility rules checked at display time
        // For now, we don't filter at activation time
        return false;
    };
    // Backward compatibility - keep getSurveys() as alias for getActivatedIds()
    SurveyEventReceiver.prototype.getSurveys = function () {
        return this.getActivatedIds();
    };
    // Backward compatibility - keep getEventToSurveys() as alias
    SurveyEventReceiver.prototype.getEventToSurveys = function () {
        return this.getEventToItemsMap();
    };
    return SurveyEventReceiver;
}(event_receiver_1.EventReceiver));
exports.SurveyEventReceiver = SurveyEventReceiver;
//# sourceMappingURL=survey-event-receiver.js.map