import { ht as dateFnsHt } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Haitian Creole locale extended with DayPicker-specific translations. */
export const ht = {
    ...dateFnsHt,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Jodi a, ${label}`;
            if (modifiers.selected)
                label = `${label}, chwazi`;
            return label;
        },
        labelMonthDropdown: "Chwazi mwa a",
        labelNext: "Ale nan pwochen mwa",
        labelPrevious: "Ale nan mwa anvan",
        labelWeekNumber: (weekNumber) => `Semèn ${weekNumber}`,
        labelYearDropdown: "Chwazi ane a",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Jodi a, ${label}`;
            }
            return label;
        },
        labelNav: "Ba navigasyon",
        labelWeekNumberHeader: "Nimewo semèn",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
