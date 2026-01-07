"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pl = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Polish locale extended with DayPicker-specific translations. */
exports.pl = {
    ...locale_1.pl,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Dziś, ${label}`;
            if (modifiers.selected)
                label = `${label}, zaznaczony`;
            return label;
        },
        labelMonthDropdown: "Wybierz miesiąc",
        labelNext: "Przejdź do następnego miesiąca",
        labelPrevious: "Przejdź do poprzedniego miesiąca",
        labelWeekNumber: (weekNumber) => `Tydzień ${weekNumber}`,
        labelYearDropdown: "Wybierz rok",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Dziś, ${label}`;
            }
            return label;
        },
        labelNav: "Pasek nawigacyjny",
        labelWeekNumberHeader: "Numer tygodnia",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
