"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ca = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Catalan locale extended with DayPicker-specific translations. */
exports.ca = {
    ...locale_1.ca,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Avui, ${label}`;
            if (modifiers.selected)
                label = `${label}, seleccionat`;
            return label;
        },
        labelMonthDropdown: "Tria el mes",
        labelNext: "Ves al mes següent",
        labelPrevious: "Ves al mes anterior",
        labelWeekNumber: (weekNumber) => `Setmana ${weekNumber}`,
        labelYearDropdown: "Tria l'any",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Avui, ${label}`;
            }
            return label;
        },
        labelNav: "Barra de navegació",
        labelWeekNumberHeader: "Número de setmana",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
