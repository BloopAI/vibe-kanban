"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.it = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Italian locale extended with DayPicker-specific translations. */
exports.it = {
    ...locale_1.it,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Oggi, ${label}`;
            if (modifiers.selected)
                label = `${label}, selezionato`;
            return label;
        },
        labelMonthDropdown: "Scegli il mese",
        labelNext: "Vai al mese successivo",
        labelPrevious: "Vai al mese precedente",
        labelWeekNumber: (weekNumber) => `Settimana ${weekNumber}`,
        labelYearDropdown: "Scegli l’anno",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Oggi, ${label}`;
            }
            return label;
        },
        labelNav: "Barra di navigazione",
        labelWeekNumberHeader: "Numero settimana",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
