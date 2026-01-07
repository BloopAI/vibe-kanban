import { lb as dateFnsLb } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Luxembourgish locale extended with DayPicker-specific translations. */
export const lb = {
    ...dateFnsLb,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Haut, ${label}`;
            if (modifiers.selected)
                label = `${label}, ausgewielt`;
            return label;
        },
        labelMonthDropdown: "Mount auswielen",
        labelNext: "Op de nächste Mount",
        labelPrevious: "Op de virdrun Mount",
        labelWeekNumber: (weekNumber) => `Woch ${weekNumber}`,
        labelYearDropdown: "Joer auswielen",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Haut, ${label}`;
            }
            return label;
        },
        labelNav: "Navigatiounsbar",
        labelWeekNumberHeader: "Wochennummer",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
