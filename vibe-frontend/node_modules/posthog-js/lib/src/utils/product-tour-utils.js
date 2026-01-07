"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.doesTourActivateByEvent = doesTourActivateByEvent;
exports.doesTourActivateByAction = doesTourActivateByAction;
function doesTourActivateByEvent(tour) {
    var _a, _b;
    return !!(((_a = tour.conditions) === null || _a === void 0 ? void 0 : _a.events) && ((_b = tour.conditions.events.values) === null || _b === void 0 ? void 0 : _b.length) > 0);
}
function doesTourActivateByAction(tour) {
    var _a, _b;
    return !!(((_a = tour.conditions) === null || _a === void 0 ? void 0 : _a.actions) && ((_b = tour.conditions.actions.values) === null || _b === void 0 ? void 0 : _b.length) > 0);
}
//# sourceMappingURL=product-tour-utils.js.map