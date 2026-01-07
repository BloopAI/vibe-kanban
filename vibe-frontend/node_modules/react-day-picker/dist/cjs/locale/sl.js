"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sl = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Slovene locale extended with DayPicker-specific translations. */
exports.sl = {
    ...locale_1.sl,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Danes, ${label}`;
            if (modifiers.selected)
                label = `${label}, izbrano`;
            return label;
        },
        labelMonthDropdown: "Izberite mesec",
        labelNext: "Pojdi na naslednji mesec",
        labelPrevious: "Pojdi na prejšnji mesec",
        labelWeekNumber: (weekNumber) => `Teden ${weekNumber}`,
        labelYearDropdown: "Izberite leto",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Danes, ${label}`;
            }
            return label;
        },
        labelNav: "Navigacijska vrstica",
        labelWeekNumberHeader: "Številka tedna",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
