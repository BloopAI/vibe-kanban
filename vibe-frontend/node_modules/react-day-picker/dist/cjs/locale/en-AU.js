"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enAU = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** English (Australia) locale extended with DayPicker-specific translations. */
exports.enAU = {
    ...locale_1.enAU,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Today, ${label}`;
            if (modifiers.selected)
                label = `${label}, selected`;
            return label;
        },
        labelMonthDropdown: "Choose the Month",
        labelNext: "Go to the Next Month",
        labelPrevious: "Go to the Previous Month",
        labelWeekNumber: (weekNumber) => `Week ${weekNumber}`,
        labelYearDropdown: "Choose the Year",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Today, ${label}`;
            }
            return label;
        },
        labelNav: "Navigation bar",
        labelWeekNumberHeader: "Week Number",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
