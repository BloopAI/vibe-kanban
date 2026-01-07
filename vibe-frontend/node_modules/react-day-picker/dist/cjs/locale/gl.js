"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gl = void 0;
const locale_1 = require("date-fns/locale");
const DateLib_js_1 = require("../classes/DateLib.js");
/** Galician locale extended with DayPicker-specific translations. */
exports.gl = {
    ...locale_1.gl,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Hoxe, ${label}`;
            if (modifiers.selected)
                label = `${label}, seleccionado`;
            return label;
        },
        labelMonthDropdown: "Escoller o mes",
        labelNext: "Ir ao mes seguinte",
        labelPrevious: "Ir ao mes anterior",
        labelWeekNumber: (weekNumber) => `Semana ${weekNumber}`,
        labelYearDropdown: "Escoller o ano",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib_js_1.DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Hoxe, ${label}`;
            }
            return label;
        },
        labelNav: "Barra de navegación",
        labelWeekNumberHeader: "Número de semana",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib_js_1.DateLib(options)).format(date, "cccc"),
    },
};
