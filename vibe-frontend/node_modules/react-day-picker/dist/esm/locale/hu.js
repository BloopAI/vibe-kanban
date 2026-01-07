import { hu as dateFnsHu } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Hungarian locale extended with DayPicker-specific translations. */
export const hu = {
    ...dateFnsHu,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Ma, ${label}`;
            if (modifiers.selected)
                label = `${label}, kiválasztva`;
            return label;
        },
        labelMonthDropdown: "Válassza ki a hónapot",
        labelNext: "Ugrás a következő hónapra",
        labelPrevious: "Ugrás az előző hónapra",
        labelWeekNumber: (weekNumber) => `Hét ${weekNumber}`,
        labelYearDropdown: "Válassza ki az évet",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Ma, ${label}`;
            }
            return label;
        },
        labelNav: "Navigációs sáv",
        labelWeekNumberHeader: "Hét száma",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
