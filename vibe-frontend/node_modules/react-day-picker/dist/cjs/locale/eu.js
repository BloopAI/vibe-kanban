"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.eu = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Basque locale extended with DayPicker-specific translations. */
exports.eu = {
    ...locale_1.eu,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Gaur, ${label}`;
            if (modifiers.selected)
                label = `${label}, hautatua`;
            return label;
        },
        labelMonthDropdown: "Hautatu hilabetea",
        labelNext: "Joan hurrengo hilabetera",
        labelPrevious: "Joan aurreko hilabetera",
        labelWeekNumber: (weekNumber) => `Astea ${weekNumber}`,
        labelYearDropdown: "Hautatu urtea",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Gaur, ${label}`;
            }
            return label;
        },
        labelNav: "Nabigazio barra",
        labelWeekNumberHeader: "Aste zenbakia",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
