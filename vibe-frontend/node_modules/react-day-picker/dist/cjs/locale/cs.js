"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cs = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Czech locale extended with DayPicker-specific translations. */
exports.cs = {
    ...locale_1.cs,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Dnes, ${label}`;
            if (modifiers.selected)
                label = `${label}, vybráno`;
            return label;
        },
        labelMonthDropdown: "Vyberte měsíc",
        labelNext: "Přejít na další měsíc",
        labelPrevious: "Přejít na předchozí měsíc",
        labelWeekNumber: (weekNumber) => `Týden ${weekNumber}`,
        labelYearDropdown: "Vyberte rok",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Dnes, ${label}`;
            }
            return label;
        },
        labelNav: "Navigační panel",
        labelWeekNumberHeader: "Číslo týdne",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
