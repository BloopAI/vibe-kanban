"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ckb = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/**
 * Central Kurdish (Sorani) locale extended with DayPicker-specific
 * translations.
 */
exports.ckb = {
    ...locale_1.ckb,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `ئەمڕۆ، ${label}`;
            if (modifiers.selected)
                label = `${label}، هەڵبژێرا`;
            return label;
        },
        labelMonthDropdown: "مانگ هەڵبژێرە",
        labelNext: "بڕۆ بۆ مانگی داهاتوو",
        labelPrevious: "بڕۆ بۆ مانگی پێشوو",
        labelWeekNumber: (weekNumber) => `هەفتە ${weekNumber}`,
        labelYearDropdown: "ساڵ هەڵبژێرە",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `ئەمڕۆ، ${label}`;
            }
            return label;
        },
        labelNav: "شریتی ڕاڕەوێژ",
        labelWeekNumberHeader: "ژمارەی هەفتە",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
