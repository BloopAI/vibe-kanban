"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bg = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Bulgarian locale extended with DayPicker-specific translations. */
exports.bg = {
    ...locale_1.bg,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Днес, ${label}`;
            if (modifiers.selected)
                label = `${label}, избрано`;
            return label;
        },
        labelMonthDropdown: "Изберете месец",
        labelNext: "Към следващия месец",
        labelPrevious: "Към предишния месец",
        labelWeekNumber: (weekNumber) => `Седмица ${weekNumber}`,
        labelYearDropdown: "Изберете година",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Днес, ${label}`;
            }
            return label;
        },
        labelNav: "Лента за навигация",
        labelWeekNumberHeader: "Номер на седмица",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
