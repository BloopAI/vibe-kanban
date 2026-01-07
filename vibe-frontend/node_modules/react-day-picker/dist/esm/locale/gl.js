import { gl as dateFnsGl } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Galician locale extended with DayPicker-specific translations. */
export const gl = {
    ...dateFnsGl,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
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
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Hoxe, ${label}`;
            }
            return label;
        },
        labelNav: "Barra de navegación",
        labelWeekNumberHeader: "Número de semana",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
