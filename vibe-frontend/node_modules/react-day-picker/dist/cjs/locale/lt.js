"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lt = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Lithuanian locale extended with DayPicker-specific translations. */
exports.lt = {
    ...locale_1.lt,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Šiandien, ${label}`;
            if (modifiers.selected)
                label = `${label}, pasirinkta`;
            return label;
        },
        labelMonthDropdown: "Pasirinkite mėnesį",
        labelNext: "Pereiti į kitą mėnesį",
        labelPrevious: "Pereiti į ankstesnį mėnesį",
        labelWeekNumber: (weekNumber) => `Savaitė ${weekNumber}`,
        labelYearDropdown: "Pasirinkite metus",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Šiandien, ${label}`;
            }
            return label;
        },
        labelNav: "Naršymo juosta",
        labelWeekNumberHeader: "Savaitės numeris",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
