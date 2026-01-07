"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fi = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Finnish locale extended with DayPicker-specific translations. */
exports.fi = {
    ...locale_1.fi,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Tänään, ${label}`;
            if (modifiers.selected)
                label = `${label}, valittu`;
            return label;
        },
        labelMonthDropdown: "Valitse kuukausi",
        labelNext: "Siirry seuraavaan kuukauteen",
        labelPrevious: "Siirry edelliseen kuukauteen",
        labelWeekNumber: (weekNumber) => `Viikko ${weekNumber}`,
        labelYearDropdown: "Valitse vuosi",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Tänään, ${label}`;
            }
            return label;
        },
        labelNav: "Navigointipalkki",
        labelWeekNumberHeader: "Viikkonumero",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
