"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sv = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Swedish locale extended with DayPicker-specific translations. */
exports.sv = {
    ...locale_1.sv,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Idag, ${label}`;
            if (modifiers.selected)
                label = `${label}, vald`;
            return label;
        },
        labelMonthDropdown: "Välj månad",
        labelNext: "Gå till nästa månad",
        labelPrevious: "Gå till föregående månad",
        labelWeekNumber: (weekNumber) => `Vecka ${weekNumber}`,
        labelYearDropdown: "Välj år",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Idag, ${label}`;
            }
            return label;
        },
        labelNav: "Navigationsfält",
        labelWeekNumberHeader: "Veckonummer",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
