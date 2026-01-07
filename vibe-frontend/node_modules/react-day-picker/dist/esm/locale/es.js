import { es as dateFnsEs } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Spanish locale extended with DayPicker-specific translations. */
export const es = {
    ...dateFnsEs,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
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
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Hoy, ${label}`;
            }
            return label;
        },
        labelNav: "Barra de navegación",
        labelWeekNumberHeader: "Número de semana",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
