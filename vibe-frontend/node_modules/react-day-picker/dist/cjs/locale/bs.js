"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bs = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Bosnian locale extended with DayPicker-specific translations. */
exports.bs = {
    ...locale_1.bs,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Danas, ${label}`;
            if (modifiers.selected)
                label = `${label}, odabrano`;
            return label;
        },
        labelMonthDropdown: "Odaberite mjesec",
        labelNext: "Idi na sljedeći mjesec",
        labelPrevious: "Idi na prethodni mjesec",
        labelWeekNumber: (weekNumber) => `Sedmica ${weekNumber}`,
        labelYearDropdown: "Odaberite godinu",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Danas, ${label}`;
            }
            return label;
        },
        labelNav: "Navigacijska traka",
        labelWeekNumberHeader: "Broj sedmice",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
