"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ht = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Haitian Creole locale extended with DayPicker-specific translations. */
exports.ht = {
    ...locale_1.ht,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Jodi a, ${label}`;
            if (modifiers.selected)
                label = `${label}, chwazi`;
            return label;
        },
        labelMonthDropdown: "Chwazi mwa a",
        labelNext: "Ale nan pwochen mwa",
        labelPrevious: "Ale nan mwa anvan",
        labelWeekNumber: (weekNumber) => `Semèn ${weekNumber}`,
        labelYearDropdown: "Chwazi ane a",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Jodi a, ${label}`;
            }
            return label;
        },
        labelNav: "Ba navigasyon",
        labelWeekNumberHeader: "Nimewo semèn",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
