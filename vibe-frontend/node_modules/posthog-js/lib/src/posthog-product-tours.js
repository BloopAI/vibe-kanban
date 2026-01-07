"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostHogProductTours = void 0;
var constants_1 = require("./constants");
var logger_1 = require("./utils/logger");
var core_1 = require("@posthog/core");
var globals_1 = require("./utils/globals");
var logger = (0, logger_1.createLogger)('[Product Tours]');
var PRODUCT_TOURS_STORAGE_KEY = 'ph_product_tours';
var isProductToursEnabled = function (instance) {
    var _a;
    if (instance.config.disable_product_tours) {
        return false;
    }
    return !!((_a = instance.persistence) === null || _a === void 0 ? void 0 : _a.get_property(constants_1.PRODUCT_TOURS_ENABLED_SERVER_SIDE));
};
var PostHogProductTours = /** @class */ (function () {
    function PostHogProductTours(instance) {
        this._productTourManager = null;
        this._cachedTours = null;
        this._instance = instance;
    }
    PostHogProductTours.prototype.onRemoteConfig = function (response) {
        var _a;
        if (this._instance.persistence) {
            this._instance.persistence.register((_a = {},
                _a[constants_1.PRODUCT_TOURS_ENABLED_SERVER_SIDE] = !!(response === null || response === void 0 ? void 0 : response.productTours),
                _a));
        }
        this.loadIfEnabled();
    };
    PostHogProductTours.prototype.loadIfEnabled = function () {
        var _this = this;
        if (this._productTourManager || !isProductToursEnabled(this._instance)) {
            return;
        }
        this._loadScript(function () { return _this._startProductTours(); });
    };
    PostHogProductTours.prototype._loadScript = function (cb) {
        var _a, _b, _c;
        if ((_a = globals_1.assignableWindow.__PosthogExtensions__) === null || _a === void 0 ? void 0 : _a.generateProductTours) {
            cb();
            return;
        }
        (_c = (_b = globals_1.assignableWindow.__PosthogExtensions__) === null || _b === void 0 ? void 0 : _b.loadExternalDependency) === null || _c === void 0 ? void 0 : _c.call(_b, this._instance, 'product-tours', function (err) {
            if (err) {
                logger.error('Could not load product tours script', err);
                return;
            }
            cb();
        });
    };
    PostHogProductTours.prototype._startProductTours = function () {
        var _a;
        if (this._productTourManager || !((_a = globals_1.assignableWindow.__PosthogExtensions__) === null || _a === void 0 ? void 0 : _a.generateProductTours)) {
            return;
        }
        this._productTourManager = globals_1.assignableWindow.__PosthogExtensions__.generateProductTours(this._instance, true);
    };
    PostHogProductTours.prototype.getProductTours = function (callback, forceReload) {
        var _this = this;
        if (forceReload === void 0) { forceReload = false; }
        if ((0, core_1.isArray)(this._cachedTours) && !forceReload) {
            callback(this._cachedTours, { isLoaded: true });
            return;
        }
        var persistence = this._instance.persistence;
        if (persistence) {
            var storedTours = persistence.props[PRODUCT_TOURS_STORAGE_KEY];
            if ((0, core_1.isArray)(storedTours) && !forceReload) {
                this._cachedTours = storedTours;
                callback(storedTours, { isLoaded: true });
                return;
            }
        }
        this._instance._send_request({
            url: this._instance.requestRouter.endpointFor('api', "/api/product_tours/?token=".concat(this._instance.config.token)),
            method: 'GET',
            callback: function (response) {
                var _a;
                var statusCode = response.statusCode;
                if (statusCode !== 200 || !response.json) {
                    var error = "Product Tours API could not be loaded, status: ".concat(statusCode);
                    logger.error(error);
                    callback([], { isLoaded: false, error: error });
                    return;
                }
                var tours = (0, core_1.isArray)(response.json.product_tours) ? response.json.product_tours : [];
                _this._cachedTours = tours;
                if (persistence) {
                    persistence.register((_a = {}, _a[PRODUCT_TOURS_STORAGE_KEY] = tours, _a));
                }
                callback(tours, { isLoaded: true });
            },
        });
    };
    PostHogProductTours.prototype.getActiveProductTours = function (callback) {
        if ((0, core_1.isNullish)(this._productTourManager)) {
            callback([], { isLoaded: false, error: 'Product tours not loaded' });
            return;
        }
        this._productTourManager.getActiveProductTours(callback);
    };
    PostHogProductTours.prototype.showProductTour = function (tourId) {
        var _a;
        (_a = this._productTourManager) === null || _a === void 0 ? void 0 : _a.showTourById(tourId);
    };
    // force load product tours extension and render a tour,
    // ignoring all display conditions.
    PostHogProductTours.prototype.previewTour = function (tour) {
        var _this = this;
        if (this._productTourManager) {
            this._productTourManager.previewTour(tour);
            return;
        }
        this._loadScript(function () {
            var _a;
            _this._startProductTours();
            (_a = _this._productTourManager) === null || _a === void 0 ? void 0 : _a.previewTour(tour);
        });
    };
    PostHogProductTours.prototype.dismissProductTour = function () {
        var _a;
        (_a = this._productTourManager) === null || _a === void 0 ? void 0 : _a.dismissTour('user_clicked_skip');
    };
    PostHogProductTours.prototype.nextStep = function () {
        var _a;
        (_a = this._productTourManager) === null || _a === void 0 ? void 0 : _a.nextStep();
    };
    PostHogProductTours.prototype.previousStep = function () {
        var _a;
        (_a = this._productTourManager) === null || _a === void 0 ? void 0 : _a.previousStep();
    };
    PostHogProductTours.prototype.clearCache = function () {
        var _a;
        this._cachedTours = null;
        (_a = this._instance.persistence) === null || _a === void 0 ? void 0 : _a.unregister(PRODUCT_TOURS_STORAGE_KEY);
    };
    PostHogProductTours.prototype.resetTour = function (tourId) {
        var _a;
        (_a = this._productTourManager) === null || _a === void 0 ? void 0 : _a.resetTour(tourId);
    };
    PostHogProductTours.prototype.resetAllTours = function () {
        var _a;
        (_a = this._productTourManager) === null || _a === void 0 ? void 0 : _a.resetAllTours();
    };
    PostHogProductTours.prototype.cancelPendingTour = function (tourId) {
        var _a;
        (_a = this._productTourManager) === null || _a === void 0 ? void 0 : _a.cancelPendingTour(tourId);
    };
    return PostHogProductTours;
}());
exports.PostHogProductTours = PostHogProductTours;
//# sourceMappingURL=posthog-product-tours.js.map