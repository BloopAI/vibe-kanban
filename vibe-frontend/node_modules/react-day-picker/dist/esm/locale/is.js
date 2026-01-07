import { is as dateFnsIs } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Icelandic locale extended with DayPicker-specific translations. */
export const is = {
    ...dateFnsIs,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Í dag, ${label}`;
            if (modifiers.selected)
                label = `${label}, valið`;
            return label;
        },
        labelMonthDropdown: "Veldu mánuð",
        labelNext: "Farðu í næsta mánuð",
        labelPrevious: "Farðu í fyrri mánuð",
        labelWeekNumber: (weekNumber) => `Vika ${weekNumber}`,
        labelYearDropdown: "Veldu árið",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Í dag, ${label}`;
            }
            return label;
        },
        labelNav: "Leiðarstika",
        labelWeekNumberHeader: "Vikunúmer",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
