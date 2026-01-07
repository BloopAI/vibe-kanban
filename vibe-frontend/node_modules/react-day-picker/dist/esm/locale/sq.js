import { sq as dateFnsSq } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Albanian locale extended with DayPicker-specific translations. */
export const sq = {
    ...dateFnsSq,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Sot, ${label}`;
            if (modifiers.selected)
                label = `${label}, zgjedhur`;
            return label;
        },
        labelMonthDropdown: "Zgjidhni muajin",
        labelNext: "Shko te muaji tjetër",
        labelPrevious: "Shko te muaji i mëparshëm",
        labelWeekNumber: (weekNumber) => `Java ${weekNumber}`,
        labelYearDropdown: "Zgjidhni vitin",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Sot, ${label}`;
            }
            return label;
        },
        labelNav: "Shiriti i navigimit",
        labelWeekNumberHeader: "Numri i javës",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
