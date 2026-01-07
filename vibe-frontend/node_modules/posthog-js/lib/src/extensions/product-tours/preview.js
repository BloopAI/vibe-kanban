"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderProductTourPreview = renderProductTourPreview;
var jsx_runtime_1 = require("preact/jsx-runtime");
var preact_1 = require("preact");
var globals_1 = require("../../utils/globals");
var ProductTourSurveyStepInner_1 = require("./components/ProductTourSurveyStepInner");
var ProductTourTooltipInner_1 = require("./components/ProductTourTooltipInner");
var product_tours_utils_1 = require("./product-tours-utils");
var document = globals_1.document;
function renderProductTourPreview(_a) {
    var step = _a.step, appearance = _a.appearance, parentElement = _a.parentElement, _b = _a.stepIndex, stepIndex = _b === void 0 ? 0 : _b, _c = _a.totalSteps, totalSteps = _c === void 0 ? 1 : _c, style = _a.style;
    parentElement.innerHTML = '';
    var shadowHost = document.createElement('div');
    (0, product_tours_utils_1.addProductTourCSSVariablesToElement)(shadowHost, appearance);
    parentElement.appendChild(shadowHost);
    var shadow = shadowHost.attachShadow({ mode: 'open' });
    var stylesheet = (0, product_tours_utils_1.getProductTourStylesheet)();
    if (stylesheet) {
        shadow.appendChild(stylesheet);
    }
    var renderTarget = document.createElement('div');
    shadow.appendChild(renderTarget);
    var isSurveyStep = step.type === 'survey';
    var tooltipClass = isSurveyStep ? 'ph-tour-tooltip ph-tour-survey-step' : 'ph-tour-tooltip';
    (0, preact_1.render)((0, jsx_runtime_1.jsx)("div", { class: "ph-tour-container", children: (0, jsx_runtime_1.jsx)("div", { class: tooltipClass, style: __assign({ position: 'relative', animation: 'none' }, style), children: isSurveyStep ? ((0, jsx_runtime_1.jsx)(ProductTourSurveyStepInner_1.ProductTourSurveyStepInner, { step: step, appearance: appearance, stepIndex: stepIndex, totalSteps: totalSteps })) : ((0, jsx_runtime_1.jsx)(ProductTourTooltipInner_1.ProductTourTooltipInner, { step: step, appearance: appearance, stepIndex: stepIndex, totalSteps: totalSteps })) }) }), renderTarget);
}
//# sourceMappingURL=preview.js.map