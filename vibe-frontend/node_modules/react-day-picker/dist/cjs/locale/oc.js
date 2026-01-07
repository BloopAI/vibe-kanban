"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.oc = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Occitan locale extended with DayPicker-specific translations. */
exports.oc = {
    ...locale_1.oc,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Uèi, ${label}`;
            if (modifiers.selected)
                label = `${label}, seleccionat`;
            return label;
        },
        labelMonthDropdown: "Causissètz lo mes",
        labelNext: "Anar al mes que ven",
        labelPrevious: "Anar al mes precedent",
        labelWeekNumber: (weekNumber) => `Setmana ${weekNumber}`,
        labelYearDropdown: "Causissètz l'annada",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Uèi, ${label}`;
            }
            return label;
        },
        labelNav: "Barra de navigacion",
        labelWeekNumberHeader: "Numèro de setmana",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
