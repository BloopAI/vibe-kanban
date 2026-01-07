import * as defaultLabels from "../labels/index.js";
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
export function getLabels(customLabels, options) {
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
