"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.is = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Icelandic locale extended with DayPicker-specific translations. */
exports.is = {
    ...locale_1.is,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Í dag, ${label}`;
            if (modifiers.selected)
                label = `${label}, valið`;
            return label;
        },
        labelMonthDropdown: "Veldu mánuð",
        labelNext: "Farðu í næsta mánuð",
        labelPrevious: "Farðu í fyrri mánuð",
        labelWeekNumber: (weekNumber) => `Vika ${weekNumber}`,
        labelYearDropdown: "Veldu árið",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Í dag, ${label}`;
            }
            return label;
        },
        labelNav: "Leiðarstika",
        labelWeekNumberHeader: "Vikunúmer",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
