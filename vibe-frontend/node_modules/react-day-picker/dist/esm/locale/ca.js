import { ca as dateFnsCa } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Catalan locale extended with DayPicker-specific translations. */
export const ca = {
    ...dateFnsCa,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
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
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Avui, ${label}`;
            }
            return label;
        },
        labelNav: "Barra de navegació",
        labelWeekNumberHeader: "Número de setmana",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
