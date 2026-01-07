"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.km = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Khmer locale extended with DayPicker-specific translations. */
exports.km = {
    ...locale_1.km,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `ថ្ងៃ​នេះ, ${label}`;
            if (modifiers.selected)
                label = `${label}, បាន​ជ្រើស`;
            return label;
        },
        labelMonthDropdown: "ជ្រើសខែ",
        labelNext: "ទៅខែក្រោយ",
        labelPrevious: "ទៅខែមុន",
        labelWeekNumber: (weekNumber) => `សប្ដាហ៍ ${weekNumber}`,
        labelYearDropdown: "ជ្រើសឆ្នាំ",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `ថ្ងៃ​នេះ, ${label}`;
            }
            return label;
        },
        labelNav: "របាររុករក",
        labelWeekNumberHeader: "លេខសប្ដាហ៍",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
