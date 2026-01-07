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
var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProductTourStylesheet = getProductTourStylesheet;
exports.findElementBySelector = findElementBySelector;
exports.isElementVisible = isElementVisible;
exports.getElementMetadata = getElementMetadata;
exports.calculateTooltipPosition = calculateTooltipPosition;
exports.getSpotlightStyle = getSpotlightStyle;
exports.addProductTourCSSVariablesToElement = addProductTourCSSVariablesToElement;
exports.renderTipTapContent = renderTipTapContent;
exports.normalizeUrl = normalizeUrl;
var posthog_product_tours_types_1 = require("../../posthog-product-tours-types");
var stylesheet_loader_1 = require("../utils/stylesheet-loader");
var globals_1 = require("../../utils/globals");
var surveys_extension_utils_1 = require("../surveys/surveys-extension-utils");
var product_tour_css_1 = __importDefault(require("./product-tour.css"));
var document = globals_1.document;
var window = globals_1.window;
function getProductTourStylesheet() {
    var stylesheet = (0, stylesheet_loader_1.prepareStylesheet)(document, typeof product_tour_css_1.default === 'string' ? product_tour_css_1.default : '');
    stylesheet === null || stylesheet === void 0 ? void 0 : stylesheet.setAttribute('data-ph-product-tour-style', 'true');
    return stylesheet;
}
function findElementBySelector(selector) {
    try {
        var elements = document.querySelectorAll(selector);
        if (elements.length === 0) {
            return { element: null, error: 'not_found', matchCount: 0 };
        }
        var element = elements[0];
        if (!isElementVisible(element)) {
            return { element: null, error: 'not_visible', matchCount: elements.length };
        }
        if (elements.length > 1) {
            return { element: element, error: 'multiple_matches', matchCount: elements.length };
        }
        return { element: element, error: null, matchCount: 1 };
    }
    catch (_a) {
        return { element: null, error: 'not_found', matchCount: 0 };
    }
}
function isElementVisible(element) {
    var style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
    }
    var rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
        return false;
    }
    return true;
}
function getElementMetadata(element) {
    var _a;
    return {
        tag: element.tagName,
        id: element.id || undefined,
        classes: element.className || undefined,
        text: ((_a = element.innerText) === null || _a === void 0 ? void 0 : _a.slice(0, 100)) || undefined,
    };
}
var TOOLTIP_MARGIN = 12;
var TOOLTIP_WIDTH = 320;
var TOOLTIP_HEIGHT_ESTIMATE = 180;
function calculateTooltipPosition(targetRect) {
    var viewportWidth = window.innerWidth;
    var viewportHeight = window.innerHeight;
    var spaceBelow = viewportHeight - targetRect.bottom;
    var spaceLeft = targetRect.left;
    var spaceRight = viewportWidth - targetRect.right;
    var position;
    var top;
    var left;
    if (spaceRight >= TOOLTIP_WIDTH + TOOLTIP_MARGIN) {
        position = 'right';
        top = targetRect.top + targetRect.height / 2 - TOOLTIP_HEIGHT_ESTIMATE / 2;
        left = targetRect.right + TOOLTIP_MARGIN;
    }
    else if (spaceLeft >= TOOLTIP_WIDTH + TOOLTIP_MARGIN) {
        position = 'left';
        top = targetRect.top + targetRect.height / 2 - TOOLTIP_HEIGHT_ESTIMATE / 2;
        left = targetRect.left - TOOLTIP_WIDTH - TOOLTIP_MARGIN;
    }
    else if (spaceBelow >= TOOLTIP_HEIGHT_ESTIMATE + TOOLTIP_MARGIN) {
        position = 'bottom';
        top = targetRect.bottom + TOOLTIP_MARGIN;
        left = targetRect.left + targetRect.width / 2 - TOOLTIP_WIDTH / 2;
    }
    else {
        position = 'top';
        top = targetRect.top - TOOLTIP_HEIGHT_ESTIMATE - TOOLTIP_MARGIN;
        left = targetRect.left + targetRect.width / 2 - TOOLTIP_WIDTH / 2;
    }
    return { top: top, left: left, position: position };
}
function getSpotlightStyle(targetRect, padding) {
    if (padding === void 0) { padding = 8; }
    return {
        top: "".concat(targetRect.top - padding, "px"),
        left: "".concat(targetRect.left - padding, "px"),
        width: "".concat(targetRect.width + padding * 2, "px"),
        height: "".concat(targetRect.height + padding * 2, "px"),
    };
}
function addProductTourCSSVariablesToElement(element, appearance) {
    var merged = __assign(__assign({}, posthog_product_tours_types_1.DEFAULT_PRODUCT_TOUR_APPEARANCE), appearance);
    var style = element.style;
    // User-customizable variables
    style.setProperty('--ph-tour-background-color', merged.backgroundColor);
    style.setProperty('--ph-tour-text-color', merged.textColor);
    style.setProperty('--ph-tour-button-color', merged.buttonColor);
    style.setProperty('--ph-tour-border-radius', "".concat(merged.borderRadius, "px"));
    style.setProperty('--ph-tour-button-border-radius', "".concat(merged.buttonBorderRadius, "px"));
    style.setProperty('--ph-tour-border-color', merged.borderColor);
    style.setProperty('--ph-tour-font-family', (0, surveys_extension_utils_1.getFontFamily)(merged.fontFamily));
    // Derived colors
    style.setProperty('--ph-tour-text-secondary-color', (0, surveys_extension_utils_1.hexToRgba)(merged.textColor, 0.6));
    style.setProperty('--ph-tour-branding-text-color', (0, surveys_extension_utils_1.getContrastingTextColor)(merged.backgroundColor));
    style.setProperty('--ph-tour-button-text-color', (0, surveys_extension_utils_1.getContrastingTextColor)(merged.buttonColor));
    style.setProperty('--ph-tour-box-shadow', merged.boxShadow);
    style.setProperty('--ph-tour-overlay-color', merged.showOverlay ? 'rgba(0, 0, 0, 0.5)' : 'transparent');
    // Internal styling variables (not customizable)
    style.setProperty('--ph-tour-button-secondary-color', 'transparent');
    style.setProperty('--ph-tour-button-secondary-text-color', merged.textColor);
    style.setProperty('--ph-tour-max-width', '320px');
    style.setProperty('--ph-tour-padding', '16px');
}
function renderTipTapContent(content) {
    var e_1, _a;
    var _b, _c;
    if (!content) {
        return '';
    }
    if (typeof content === 'string') {
        return escapeHtml(content);
    }
    if (content.type === 'text') {
        var text = escapeHtml(content.text || '');
        if (content.marks) {
            try {
                for (var _d = __values(content.marks), _e = _d.next(); !_e.done; _e = _d.next()) {
                    var mark = _e.value;
                    switch (mark.type) {
                        case 'bold':
                            text = "<strong>".concat(text, "</strong>");
                            break;
                        case 'italic':
                            text = "<em>".concat(text, "</em>");
                            break;
                        case 'underline':
                            text = "<u>".concat(text, "</u>");
                            break;
                        case 'strike':
                            text = "<s>".concat(text, "</s>");
                            break;
                    }
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (_e && !_e.done && (_a = _d.return)) _a.call(_d);
                }
                finally { if (e_1) throw e_1.error; }
            }
        }
        return text;
    }
    var children = ((_b = content.content) === null || _b === void 0 ? void 0 : _b.map(renderTipTapContent).join('')) || '';
    switch (content.type) {
        case 'doc':
            return children;
        case 'paragraph':
            return "<p>".concat(children, "</p>");
        case 'heading': {
            var level = ((_c = content.attrs) === null || _c === void 0 ? void 0 : _c.level) || 1;
            return "<h".concat(level, ">").concat(children, "</h").concat(level, ">");
        }
        case 'bulletList':
            return "<ul>".concat(children, "</ul>");
        case 'orderedList':
            return "<ol>".concat(children, "</ol>");
        case 'listItem':
            return "<li>".concat(children, "</li>");
        case 'hardBreak':
            return '<br>';
        default:
            return children;
    }
}
function normalizeUrl(url) {
    return url.endsWith('/') ? url.slice(0, -1) : url;
}
function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
//# sourceMappingURL=product-tours-utils.js.map