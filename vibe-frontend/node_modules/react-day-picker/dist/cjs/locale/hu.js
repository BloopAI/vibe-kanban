"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hu = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Hungarian locale extended with DayPicker-specific translations. */
exports.hu = {
    ...locale_1.hu,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Ma, ${label}`;
            if (modifiers.selected)
                label = `${label}, kiválasztva`;
            return label;
        },
        labelMonthDropdown: "Válassza ki a hónapot",
        labelNext: "Ugrás a következő hónapra",
        labelPrevious: "Ugrás az előző hónapra",
        labelWeekNumber: (weekNumber) => `Hét ${weekNumber}`,
        labelYearDropdown: "Válassza ki az évet",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Ma, ${label}`;
            }
            return label;
        },
        labelNav: "Navigációs sáv",
        labelWeekNumberHeader: "Hét száma",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
