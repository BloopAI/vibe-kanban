import { mk as dateFnsMk } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Macedonian locale extended with DayPicker-specific translations. */
export const mk = {
    ...dateFnsMk,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Денес, ${label}`;
            if (modifiers.selected)
                label = `${label}, избрано`;
            return label;
        },
        labelMonthDropdown: "Изберете месец",
        labelNext: "Оди на следниот месец",
        labelPrevious: "Оди на претходниот месец",
        labelWeekNumber: (weekNumber) => `Недела ${weekNumber}`,
        labelYearDropdown: "Изберете година",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Денес, ${label}`;
            }
            return label;
        },
        labelNav: "Лента за навигација",
        labelWeekNumberHeader: "Број на недела",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
