import { oc as dateFnsOc } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Occitan locale extended with DayPicker-specific translations. */
export const oc = {
    ...dateFnsOc,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
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
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Uèi, ${label}`;
            }
            return label;
        },
        labelNav: "Barra de navigacion",
        labelWeekNumberHeader: "Numèro de setmana",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
