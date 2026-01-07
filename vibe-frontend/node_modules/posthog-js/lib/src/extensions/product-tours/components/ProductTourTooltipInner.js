"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductTourTooltipInner = ProductTourTooltipInner;
var jsx_runtime_1 = require("preact/jsx-runtime");
var product_tours_utils_1 = require("../product-tours-utils");
var icons_1 = require("../../surveys/icons");
function ProductTourTooltipInner(_a) {
    var _b;
    var step = _a.step, appearance = _a.appearance, stepIndex = _a.stepIndex, totalSteps = _a.totalSteps, onNext = _a.onNext, onPrevious = _a.onPrevious, onDismiss = _a.onDismiss;
    var whiteLabel = (_b = appearance === null || appearance === void 0 ? void 0 : appearance.whiteLabel) !== null && _b !== void 0 ? _b : false;
    var isLastStep = stepIndex >= totalSteps - 1;
    var isFirstStep = stepIndex === 0;
    var showNextButton = step.progressionTrigger === 'button' || step.type === 'modal';
    var isInteractive = !!(onNext || onPrevious || onDismiss);
    var cursorStyle = isInteractive ? undefined : { cursor: 'default' };
    return ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("button", { class: "ph-tour-dismiss", onClick: onDismiss, "aria-label": "Close tour", style: cursorStyle, children: icons_1.cancelSVG }), (0, jsx_runtime_1.jsx)("div", { class: "ph-tour-content", dangerouslySetInnerHTML: { __html: (0, product_tours_utils_1.renderTipTapContent)(step.content) } }), (0, jsx_runtime_1.jsxs)("div", { class: "ph-tour-footer", children: [(0, jsx_runtime_1.jsxs)("span", { class: "ph-tour-progress", children: [stepIndex + 1, " of ", totalSteps] }), (0, jsx_runtime_1.jsxs)("div", { class: "ph-tour-buttons", children: [!isFirstStep && ((0, jsx_runtime_1.jsx)("button", { class: "ph-tour-button ph-tour-button--secondary", onClick: onPrevious, style: cursorStyle, children: "Back" })), showNextButton && ((0, jsx_runtime_1.jsx)("button", { class: "ph-tour-button ph-tour-button--primary", onClick: onNext, style: cursorStyle, children: isLastStep ? 'Done' : 'Next' }))] })] }), !whiteLabel && ((0, jsx_runtime_1.jsxs)("a", { href: isInteractive ? 'https://posthog.com/product-tours' : undefined, target: isInteractive ? '_blank' : undefined, rel: isInteractive ? 'noopener noreferrer' : undefined, class: "ph-tour-branding", style: isInteractive ? undefined : { cursor: 'default', pointerEvents: 'none' }, children: ["Tour by ", icons_1.IconPosthogLogo] }))] }));
}
//# sourceMappingURL=ProductTourTooltipInner.js.map