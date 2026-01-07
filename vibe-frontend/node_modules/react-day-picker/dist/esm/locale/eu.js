import { eu as dateFnsEu } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Basque locale extended with DayPicker-specific translations. */
export const eu = {
    ...dateFnsEu,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Gaur, ${label}`;
            if (modifiers.selected)
                label = `${label}, hautatua`;
            return label;
        },
        labelMonthDropdown: "Hautatu hilabetea",
        labelNext: "Joan hurrengo hilabetera",
        labelPrevious: "Joan aurreko hilabetera",
        labelWeekNumber: (weekNumber) => `Astea ${weekNumber}`,
        labelYearDropdown: "Hautatu urtea",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Gaur, ${label}`;
            }
            return label;
        },
        labelNav: "Nabigazio barra",
        labelWeekNumberHeader: "Aste zenbakia",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
