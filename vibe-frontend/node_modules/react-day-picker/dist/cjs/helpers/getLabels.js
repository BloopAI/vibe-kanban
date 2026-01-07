"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLabels = getLabels;
const defaultLabels = __importStar(require("../labels/index.js"));
const resolveLabel = (defaultLabel, customLabel, localeLabel) => {
    if (customLabel)
        return customLabel;
    if (localeLabel) {
        return (typeof localeLabel === "function"
            ? localeLabel
            : (..._args) => localeLabel);
    }
    return defaultLabel;
};
/**
 * Merges custom labels from the props with the default labels.
 *
 * When available, uses the locale-provided translation for `labelNext`.
 *
 * @param customLabels The custom labels provided in the DayPicker props.
 * @param options Options from the date library, used to resolve locale
 *   translations.
 * @returns The merged labels object with locale-aware defaults.
 */
function getLabels(customLabels, options) {
    const localeLabels = options.locale?.labels ?? {};
    return {
        ...defaultLabels,
        ...(customLabels ?? {}),
        labelDayButton: resolveLabel(defaultLabels.labelDayButton, customLabels?.labelDayButton, localeLabels.labelDayButton),
        labelMonthDropdown: resolveLabel(defaultLabels.labelMonthDropdown, customLabels?.labelMonthDropdown, localeLabels.labelMonthDropdown),
        labelNext: resolveLabel(defaultLabels.labelNext, customLabels?.labelNext, localeLabels.labelNext),
        labelPrevious: resolveLabel(defaultLabels.labelPrevious, customLabels?.labelPrevious, localeLabels.labelPrevious),
        labelWeekNumber: resolveLabel(defaultLabels.labelWeekNumber, customLabels?.labelWeekNumber, localeLabels.labelWeekNumber),
        labelYearDropdown: resolveLabel(defaultLabels.labelYearDropdown, customLabels?.labelYearDropdown, localeLabels.labelYearDropdown),
        labelGrid: resolveLabel(defaultLabels.labelGrid, customLabels?.labelGrid, localeLabels.labelGrid),
        labelGridcell: resolveLabel(defaultLabels.labelGridcell, customLabels?.labelGridcell, localeLabels.labelGridcell),
        labelNav: resolveLabel(defaultLabels.labelNav, customLabels?.labelNav, localeLabels.labelNav),
        labelWeekNumberHeader: resolveLabel(defaultLabels.labelWeekNumberHeader, customLabels?.labelWeekNumberHeader, localeLabels.labelWeekNumberHeader),
        labelWeekday: resolveLabel(defaultLabels.labelWeekday, customLabels?.labelWeekday, localeLabels.labelWeekday),
    };
}
