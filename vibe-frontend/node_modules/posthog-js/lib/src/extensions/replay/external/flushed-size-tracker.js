"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlushedSizeTracker = void 0;
var SESSION_RECORDING_FLUSHED_SIZE = '$sess_rec_flush_size';
var FlushedSizeTracker = /** @class */ (function () {
    function FlushedSizeTracker(posthog) {
        if (!posthog.persistence) {
            throw new Error('it is not valid to not have persistence and be this far into setting up the application');
        }
        this._getProperty = posthog.get_property.bind(posthog);
        this._setProperty = posthog.persistence.set_property.bind(posthog.persistence);
    }
    FlushedSizeTracker.prototype.trackSize = function (size) {
        var currentFlushed = Number(this._getProperty(SESSION_RECORDING_FLUSHED_SIZE)) || 0;
        var newValue = currentFlushed + size;
        this._setProperty(SESSION_RECORDING_FLUSHED_SIZE, newValue);
    };
    FlushedSizeTracker.prototype.reset = function () {
        return this._setProperty(SESSION_RECORDING_FLUSHED_SIZE, 0);
    };
    Object.defineProperty(FlushedSizeTracker.prototype, "currentTrackedSize", {
        get: function () {
            return Number(this._getProperty(SESSION_RECORDING_FLUSHED_SIZE)) || 0;
        },
        enumerable: false,
        configurable: true
    });
    return FlushedSizeTracker;
}());
exports.FlushedSizeTracker = FlushedSizeTracker;
//# sourceMappingURL=flushed-size-tracker.js.map