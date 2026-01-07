"use strict";
// Naive rage click implementation: If mouse has not moved further than thresholdPx
// over clickCount clicks with max timeoutMs between clicks, it's
// counted as a rage click
Object.defineProperty(exports, "__esModule", { value: true });
var core_1 = require("@posthog/core");
var DEFAULT_THRESHOLD_PX = 30;
var DEFAULT_TIMEOUT_MS = 1000;
var DEFAULT_CLICK_COUNT = 3;
var RageClick = /** @class */ (function () {
    function RageClick(rageclickConfig) {
        this.disabled = rageclickConfig === false;
        var conf = (0, core_1.isObject)(rageclickConfig) ? rageclickConfig : {};
        this.thresholdPx = conf.threshold_px || DEFAULT_THRESHOLD_PX;
        this.timeoutMs = conf.timeout_ms || DEFAULT_TIMEOUT_MS;
        this.clickCount = conf.click_count || DEFAULT_CLICK_COUNT;
        this.clicks = [];
    }
    RageClick.prototype.isRageClick = function (x, y, timestamp) {
        if (this.disabled) {
            return false;
        }
        var lastClick = this.clicks[this.clicks.length - 1];
        if (lastClick &&
            Math.abs(x - lastClick.x) + Math.abs(y - lastClick.y) < this.thresholdPx &&
            timestamp - lastClick.timestamp < this.timeoutMs) {
            this.clicks.push({ x: x, y: y, timestamp: timestamp });
            if (this.clicks.length === this.clickCount) {
                return true;
            }
        }
        else {
            this.clicks = [{ x: x, y: y, timestamp: timestamp }];
        }
        return false;
    };
    return RageClick;
}());
exports.default = RageClick;
//# sourceMappingURL=rageclick.js.map