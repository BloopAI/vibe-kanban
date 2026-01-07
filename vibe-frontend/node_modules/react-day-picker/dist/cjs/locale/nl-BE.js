"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nlBE = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Dutch (Belgium) locale extended with DayPicker-specific translations. */
exports.nlBE = {
    ...locale_1.nlBE,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Vandaag, ${label}`;
            if (modifiers.selected)
                label = `${label}, geselecteerd`;
            return label;
        },
        labelMonthDropdown: "Kies de maand",
        labelNext: "Ga naar volgende maand",
        labelPrevious: "Ga naar vorige maand",
        labelWeekNumber: (weekNumber) => `Week ${weekNumber}`,
        labelYearDropdown: "Kies het jaar",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Vandaag, ${label}`;
            }
            return label;
        },
        labelNav: "Navigatiebalk",
        labelWeekNumberHeader: "Weeknummer",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
