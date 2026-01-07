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
exports.ProductTourEventReceiver = void 0;
var constants_1 = require("../constants");
var event_receiver_1 = require("./event-receiver");
var logger_1 = require("./logger");
var storage_1 = require("../storage");
var constants_2 = require("../extensions/product-tours/constants");
var logger = (0, logger_1.createLogger)('[Product Tour Event Receiver]');
var ProductTourEventReceiver = /** @class */ (function (_super) {
    __extends(ProductTourEventReceiver, _super);
    function ProductTourEventReceiver(instance) {
        return _super.call(this, instance) || this;
    }
    ProductTourEventReceiver.prototype._getActivatedKey = function () {
        return constants_1.PRODUCT_TOURS_ACTIVATED;
    };
    ProductTourEventReceiver.prototype._getShownEventName = function () {
        return 'product tour shown';
    };
    ProductTourEventReceiver.prototype._getItems = function (callback) {
        var _a, _b;
        (_b = (_a = this._instance) === null || _a === void 0 ? void 0 : _a.productTours) === null || _b === void 0 ? void 0 : _b.getProductTours(callback);
    };
    ProductTourEventReceiver.prototype._cancelPendingItem = function (itemId) {
        var _a, _b;
        (_b = (_a = this._instance) === null || _a === void 0 ? void 0 : _a.productTours) === null || _b === void 0 ? void 0 : _b.cancelPendingTour(itemId);
    };
    ProductTourEventReceiver.prototype._getLogger = function () {
        return logger;
    };
    ProductTourEventReceiver.prototype._isItemPermanentlyIneligible = function (itemId) {
        if (!itemId)
            return true;
        var completedKey = "".concat(constants_2.TOUR_COMPLETED_KEY_PREFIX).concat(itemId);
        var dismissedKey = "".concat(constants_2.TOUR_DISMISSED_KEY_PREFIX).concat(itemId);
        return !!(storage_1.localStore._get(completedKey) || storage_1.localStore._get(dismissedKey));
    };
    ProductTourEventReceiver.prototype.getTours = function () {
        return this.getActivatedIds();
    };
    return ProductTourEventReceiver;
}(event_receiver_1.EventReceiver));
exports.ProductTourEventReceiver = ProductTourEventReceiver;
//# sourceMappingURL=product-tour-event-receiver.js.map