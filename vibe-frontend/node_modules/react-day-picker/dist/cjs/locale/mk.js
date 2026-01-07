"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mk = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Macedonian locale extended with DayPicker-specific translations. */
exports.mk = {
    ...locale_1.mk,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Денес, ${label}`;
            if (modifiers.selected)
                label = `${label}, избрано`;
            return label;
        },
        labelMonthDropdown: "Изберете месец",
        labelNext: "Оди на следниот месец",
        labelPrevious: "Оди на претходниот месец",
        labelWeekNumber: (weekNumber) => `Недела ${weekNumber}`,
        labelYearDropdown: "Изберете година",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Денес, ${label}`;
            }
            return label;
        },
        labelNav: "Лента за навигација",
        labelWeekNumberHeader: "Број на недела",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
