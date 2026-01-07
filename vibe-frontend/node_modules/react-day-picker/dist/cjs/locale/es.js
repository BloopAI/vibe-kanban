"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.es = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Spanish locale extended with DayPicker-specific translations. */
exports.es = {
    ...locale_1.es,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Hoy, ${label}`;
            if (modifiers.selected)
                label = `${label}, seleccionado`;
            return label;
        },
        labelMonthDropdown: "Elegir el mes",
        labelNext: "Ir al mes siguiente",
        labelPrevious: "Ir al mes anterior",
        labelWeekNumber: (weekNumber) => `Semana ${weekNumber}`,
        labelYearDropdown: "Elegir el año",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Hoy, ${label}`;
            }
            return label;
        },
        labelNav: "Barra de navegación",
        labelWeekNumberHeader: "Número de semana",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
