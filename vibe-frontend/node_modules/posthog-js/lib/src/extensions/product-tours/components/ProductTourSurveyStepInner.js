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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductTourSurveyStepInner = ProductTourSurveyStepInner;
var jsx_runtime_1 = require("preact/jsx-runtime");
var hooks_1 = require("preact/hooks");
var icons_1 = require("../../surveys/icons");
var icons_2 = require("../../surveys/icons");
var threeScaleEmojis = [icons_2.dissatisfiedEmoji, icons_2.neutralEmoji, icons_2.satisfiedEmoji];
var fiveScaleEmojis = [icons_2.veryDissatisfiedEmoji, icons_2.dissatisfiedEmoji, icons_2.neutralEmoji, icons_2.satisfiedEmoji, icons_2.verySatisfiedEmoji];
function getScaleNumbers(scale) {
    switch (scale) {
        case 5:
            return [1, 2, 3, 4, 5];
        case 10:
            return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        default:
            return [1, 2, 3, 4, 5];
    }
}
function OpenTextInput(_a) {
    var value = _a.value, onChange = _a.onChange, onSubmit = _a.onSubmit, isInteractive = _a.isInteractive;
    var inputRef = (0, hooks_1.useRef)(null);
    (0, hooks_1.useEffect)(function () {
        if (isInteractive) {
            setTimeout(function () { var _a; return (_a = inputRef.current) === null || _a === void 0 ? void 0 : _a.focus(); }, 100);
        }
    }, [isInteractive]);
    var handleKeyDown = function (e) {
        if (e.key === 'Enter' && e.metaKey && isInteractive) {
            e.preventDefault();
            onSubmit === null || onSubmit === void 0 ? void 0 : onSubmit();
        }
    };
    return ((0, jsx_runtime_1.jsx)("textarea", { ref: inputRef, class: "ph-tour-survey-textarea", rows: 3, placeholder: "Your feedback (optional)...", value: value, onInput: function (e) { return onChange(e.target.value); }, onKeyDown: handleKeyDown, disabled: !isInteractive, style: isInteractive ? undefined : { cursor: 'default' } }));
}
function RatingInput(_a) {
    var survey = _a.survey, onSubmit = _a.onSubmit, isInteractive = _a.isInteractive;
    var _b = __read((0, hooks_1.useState)(null), 2), selectedRating = _b[0], setSelectedRating = _b[1];
    var display = survey.display || 'emoji';
    var scale = survey.scale || 5;
    var handleSelect = function (rating) {
        if (!isInteractive) {
            return;
        }
        setSelectedRating(rating);
        // Auto-submit on selection for ratings
        onSubmit === null || onSubmit === void 0 ? void 0 : onSubmit(rating);
    };
    if (display === 'emoji') {
        var emojis = scale === 3 ? threeScaleEmojis : fiveScaleEmojis;
        return ((0, jsx_runtime_1.jsxs)("div", { class: "ph-tour-survey-rating-container", children: [(0, jsx_runtime_1.jsx)("div", { class: "ph-tour-survey-rating-emoji", children: emojis.map(function (emoji, idx) {
                        var rating = idx + 1;
                        var isActive = selectedRating === rating;
                        return ((0, jsx_runtime_1.jsx)("button", { type: "button", class: "ph-tour-survey-emoji-button ".concat(isActive ? 'ph-tour-survey-emoji-button--active' : ''), onClick: function () { return handleSelect(rating); }, style: isInteractive ? undefined : { cursor: 'default' }, "aria-label": "Rate ".concat(rating), children: emoji }, idx));
                    }) }), (survey.lowerBoundLabel || survey.upperBoundLabel) && ((0, jsx_runtime_1.jsxs)("div", { class: "ph-tour-survey-rating-labels", children: [(0, jsx_runtime_1.jsx)("span", { children: survey.lowerBoundLabel }), (0, jsx_runtime_1.jsx)("span", { children: survey.upperBoundLabel })] }))] }));
    }
    // Number display
    var numbers = getScaleNumbers(scale);
    return ((0, jsx_runtime_1.jsxs)("div", { class: "ph-tour-survey-rating-container", children: [(0, jsx_runtime_1.jsx)("div", { class: "ph-tour-survey-rating-numbers", style: { gridTemplateColumns: "repeat(".concat(numbers.length, ", minmax(0, 1fr))") }, children: numbers.map(function (num) {
                    var isActive = selectedRating === num;
                    return ((0, jsx_runtime_1.jsx)("button", { type: "button", class: "ph-tour-survey-number-button ".concat(isActive ? 'ph-tour-survey-number-button--active' : ''), onClick: function () { return handleSelect(num); }, style: isInteractive ? undefined : { cursor: 'default' }, "aria-label": "Rate ".concat(num), children: num }, num));
                }) }), (survey.lowerBoundLabel || survey.upperBoundLabel) && ((0, jsx_runtime_1.jsxs)("div", { class: "ph-tour-survey-rating-labels", children: [(0, jsx_runtime_1.jsx)("span", { children: survey.lowerBoundLabel }), (0, jsx_runtime_1.jsx)("span", { children: survey.upperBoundLabel })] }))] }));
}
function ProductTourSurveyStepInner(_a) {
    var _b;
    var step = _a.step, appearance = _a.appearance, stepIndex = _a.stepIndex, totalSteps = _a.totalSteps, onPrevious = _a.onPrevious, onSubmit = _a.onSubmit, onDismiss = _a.onDismiss;
    var _c = __read((0, hooks_1.useState)(''), 2), textValue = _c[0], setTextValue = _c[1];
    var survey = step.survey;
    var whiteLabel = (_b = appearance === null || appearance === void 0 ? void 0 : appearance.whiteLabel) !== null && _b !== void 0 ? _b : false;
    var isFirstStep = stepIndex === 0;
    var isOpenText = (survey === null || survey === void 0 ? void 0 : survey.type) === 'open';
    var isInteractive = !!(onPrevious || onSubmit || onDismiss);
    var cursorStyle = isInteractive ? undefined : { cursor: 'default' };
    var handleTextSubmit = function () {
        onSubmit === null || onSubmit === void 0 ? void 0 : onSubmit(textValue.trim() || null);
    };
    if (!survey) {
        return (0, jsx_runtime_1.jsx)("div", {});
    }
    return ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("button", { class: "ph-tour-dismiss", onClick: onDismiss, "aria-label": "Close survey", style: cursorStyle, children: icons_1.cancelSVG }), (0, jsx_runtime_1.jsx)("div", { class: "ph-tour-survey-question", children: survey.questionText }), isOpenText ? ((0, jsx_runtime_1.jsx)(OpenTextInput, { value: textValue, onChange: setTextValue, onSubmit: handleTextSubmit, isInteractive: isInteractive })) : ((0, jsx_runtime_1.jsx)(RatingInput, { survey: survey, onSubmit: onSubmit, isInteractive: isInteractive })), (0, jsx_runtime_1.jsxs)("div", { class: "ph-tour-footer", children: [(0, jsx_runtime_1.jsxs)("span", { class: "ph-tour-progress", children: [stepIndex + 1, " of ", totalSteps] }), (0, jsx_runtime_1.jsxs)("div", { class: "ph-tour-buttons", children: [!isFirstStep && ((0, jsx_runtime_1.jsx)("button", { class: "ph-tour-button ph-tour-button--secondary", onClick: onPrevious, style: cursorStyle, children: "Back" })), isOpenText && ((0, jsx_runtime_1.jsx)("button", { class: "ph-tour-button ph-tour-button--primary", onClick: handleTextSubmit, style: cursorStyle, children: "Submit" }))] })] }), !whiteLabel && ((0, jsx_runtime_1.jsxs)("a", { href: isInteractive ? 'https://posthog.com/product-tours' : undefined, target: isInteractive ? '_blank' : undefined, rel: isInteractive ? 'noopener noreferrer' : undefined, class: "ph-tour-branding", style: isInteractive ? undefined : { cursor: 'default', pointerEvents: 'none' }, children: ["Survey by ", icons_1.IconPosthogLogo] }))] }));
}
//# sourceMappingURL=ProductTourSurveyStepInner.js.map