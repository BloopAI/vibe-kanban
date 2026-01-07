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
exports.ProductTourTooltip = ProductTourTooltip;
var jsx_runtime_1 = require("preact/jsx-runtime");
var hooks_1 = require("preact/hooks");
var product_tours_utils_1 = require("../product-tours-utils");
var utils_1 = require("../../../utils");
var globals_1 = require("../../../utils/globals");
var ProductTourTooltipInner_1 = require("./ProductTourTooltipInner");
var ProductTourSurveyStepInner_1 = require("./ProductTourSurveyStepInner");
var core_1 = require("@posthog/core");
var window = globals_1.window;
function getOppositePosition(position) {
    var opposites = {
        top: 'bottom',
        bottom: 'top',
        left: 'right',
        right: 'left',
    };
    return opposites[position];
}
function scrollToElement(element, resolve) {
    var initialRect = element.getBoundingClientRect();
    var viewportHeight = window.innerHeight;
    var viewportWidth = window.innerWidth;
    var safeMarginY = viewportHeight / 6;
    var safeMarginX = viewportWidth / 6;
    var isInSafeZone = initialRect.top >= safeMarginY &&
        initialRect.bottom <= viewportHeight - safeMarginY &&
        initialRect.left >= safeMarginX &&
        initialRect.right <= viewportWidth - safeMarginX;
    if (isInSafeZone) {
        resolve();
        return;
    }
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    var lastTop = initialRect.top;
    var stableCount = 0;
    var resolved = false;
    var checkStability = function () {
        if (resolved)
            return;
        var currentRect = element.getBoundingClientRect();
        if (Math.abs(currentRect.top - lastTop) < 1) {
            stableCount++;
            if (stableCount >= 3) {
                resolved = true;
                resolve();
                return;
            }
        }
        else {
            stableCount = 0;
        }
        lastTop = currentRect.top;
        setTimeout(checkStability, 50);
    };
    setTimeout(checkStability, 30);
    setTimeout(function () {
        if (!resolved) {
            resolved = true;
            resolve();
        }
    }, 500);
}
var TRANSITION_DURATION = 150;
function ProductTourTooltip(_a) {
    var tour = _a.tour, step = _a.step, stepIndex = _a.stepIndex, totalSteps = _a.totalSteps, targetElement = _a.targetElement, onNext = _a.onNext, onPrevious = _a.onPrevious, onDismiss = _a.onDismiss, onSurveySubmit = _a.onSurveySubmit;
    var _b = __read((0, hooks_1.useState)('entering'), 2), transitionState = _b[0], setTransitionState = _b[1];
    var _c = __read((0, hooks_1.useState)(null), 2), position = _c[0], setPosition = _c[1];
    var _d = __read((0, hooks_1.useState)(null), 2), spotlightStyle = _d[0], setSpotlightStyle = _d[1];
    var _e = __read((0, hooks_1.useState)(step), 2), displayedStep = _e[0], setDisplayedStep = _e[1];
    var _f = __read((0, hooks_1.useState)(stepIndex), 2), displayedStepIndex = _f[0], setDisplayedStepIndex = _f[1];
    var previousStepRef = (0, hooks_1.useRef)(stepIndex);
    var isTransitioningRef = (0, hooks_1.useRef)(false);
    // Modal and survey steps are both centered on screen
    var isCentered = displayedStep.type === 'modal' || displayedStep.type === 'survey';
    var updatePosition = (0, hooks_1.useCallback)(function () {
        if (!targetElement)
            return;
        var rect = targetElement.getBoundingClientRect();
        setPosition((0, product_tours_utils_1.calculateTooltipPosition)(rect));
        setSpotlightStyle((0, product_tours_utils_1.getSpotlightStyle)(rect));
    }, [targetElement]);
    (0, hooks_1.useEffect)(function () {
        var currentStepIndex = stepIndex;
        var isStepChange = previousStepRef.current !== stepIndex;
        var finishEntering = function () {
            if (previousStepRef.current !== currentStepIndex)
                return;
            setTransitionState('visible');
            isTransitioningRef.current = false;
        };
        var enterStep = function () {
            // Only scroll/position for element steps
            if (targetElement && step.type === 'element') {
                scrollToElement(targetElement, function () {
                    if (previousStepRef.current !== currentStepIndex)
                        return;
                    updatePosition();
                    setTimeout(finishEntering, 50);
                });
            }
            else {
                setTimeout(finishEntering, 50);
            }
        };
        if (!isStepChange) {
            previousStepRef.current = stepIndex;
            isTransitioningRef.current = true;
            enterStep();
            return;
        }
        previousStepRef.current = stepIndex;
        isTransitioningRef.current = true;
        setTransitionState('exiting');
        setTimeout(function () {
            if (previousStepRef.current !== currentStepIndex)
                return;
            // Reset position for element steps to prevent flash at old position
            if (step.type === 'element') {
                setPosition(null);
                setSpotlightStyle(null);
            }
            setDisplayedStep(step);
            setDisplayedStepIndex(stepIndex);
            setTransitionState('entering');
            enterStep();
        }, TRANSITION_DURATION);
    }, [targetElement, stepIndex, step, updatePosition]);
    (0, hooks_1.useEffect)(function () {
        if (transitionState !== 'visible' || isCentered)
            return;
        var handleUpdate = function () {
            if (!isTransitioningRef.current) {
                updatePosition();
            }
        };
        (0, utils_1.addEventListener)(window, 'scroll', handleUpdate, { capture: true });
        (0, utils_1.addEventListener)(window, 'resize', handleUpdate);
        return function () {
            window === null || window === void 0 ? void 0 : window.removeEventListener('scroll', handleUpdate, true);
            window === null || window === void 0 ? void 0 : window.removeEventListener('resize', handleUpdate);
        };
    }, [updatePosition, transitionState, isCentered]);
    (0, hooks_1.useEffect)(function () {
        var handleKeyDown = function (e) {
            if (e.key === 'Escape') {
                onDismiss('escape_key');
            }
        };
        (0, utils_1.addEventListener)(window, 'keydown', handleKeyDown);
        return function () {
            window === null || window === void 0 ? void 0 : window.removeEventListener('keydown', handleKeyDown);
        };
    }, [onDismiss]);
    var handleOverlayClick = function (e) {
        e.stopPropagation();
        onDismiss('user_clicked_outside');
    };
    var handleTooltipClick = function (e) {
        e.stopPropagation();
    };
    var handleSpotlightClick = function (e) {
        e.stopPropagation();
        if (targetElement) {
            targetElement.click();
        }
        onNext();
    };
    var isVisible = transitionState === 'visible';
    var isSurvey = displayedStep.type === 'survey';
    // For element steps, don't render until position is calculated
    var isPositionReady = isCentered || !(0, core_1.isNull)(position);
    var tooltipStyle = isCentered
        ? {
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
        }
        : {
            top: position ? "".concat(position.top, "px") : '0',
            left: position ? "".concat(position.left, "px") : '0',
        };
    return ((0, jsx_runtime_1.jsxs)("div", { class: "ph-tour-container", children: [(0, jsx_runtime_1.jsx)("div", { class: "ph-tour-click-overlay", onClick: handleOverlayClick }), (0, jsx_runtime_1.jsx)("div", { class: "ph-tour-modal-overlay", style: {
                    opacity: isCentered && isVisible ? 1 : 0,
                    transition: "opacity ".concat(TRANSITION_DURATION, "ms ease-out"),
                    pointerEvents: isCentered ? 'auto' : 'none',
                } }), (0, jsx_runtime_1.jsx)("div", { class: "ph-tour-spotlight", style: __assign(__assign(__assign({}, (isVisible && isPositionReady && spotlightStyle
                    ? spotlightStyle
                    : { top: '50%', left: '50%', width: '0px', height: '0px' })), { opacity: !isCentered && isVisible && isPositionReady ? 1 : 0, transition: "opacity ".concat(TRANSITION_DURATION, "ms ease-out") }), (displayedStep.progressionTrigger === 'click' &&
                    !isCentered && {
                    pointerEvents: 'auto',
                    cursor: 'pointer',
                })), onClick: displayedStep.progressionTrigger === 'click' && !isCentered ? handleSpotlightClick : undefined }), (0, jsx_runtime_1.jsxs)("div", { class: "ph-tour-tooltip ".concat(isCentered ? 'ph-tour-tooltip--modal' : '', " ").concat(isSurvey ? 'ph-tour-survey-step' : ''), style: __assign(__assign({}, tooltipStyle), { opacity: isVisible && isPositionReady ? 1 : 0, transition: "opacity ".concat(TRANSITION_DURATION, "ms ease-out") }), onClick: handleTooltipClick, children: [!isCentered && position && ((0, jsx_runtime_1.jsx)("div", { class: "ph-tour-arrow ph-tour-arrow--".concat(getOppositePosition(position.position)) })), isSurvey ? ((0, jsx_runtime_1.jsx)(ProductTourSurveyStepInner_1.ProductTourSurveyStepInner, { step: displayedStep, appearance: tour.appearance, stepIndex: displayedStepIndex, totalSteps: totalSteps, onSubmit: onSurveySubmit, onPrevious: onPrevious, onDismiss: function () { return onDismiss('user_clicked_skip'); } })) : ((0, jsx_runtime_1.jsx)(ProductTourTooltipInner_1.ProductTourTooltipInner, { step: displayedStep, appearance: tour.appearance, stepIndex: displayedStepIndex, totalSteps: totalSteps, onNext: onNext, onPrevious: onPrevious, onDismiss: function () { return onDismiss('user_clicked_skip'); } }))] })] }));
}
//# sourceMappingURL=ProductTourTooltip.js.map