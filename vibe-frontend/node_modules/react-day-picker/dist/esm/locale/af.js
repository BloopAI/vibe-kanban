import { af as dateFnsAf } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Afrikaans locale extended with DayPicker-specific translations. */
export const af = {
    ...dateFnsAf,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Vandag, ${label}`;
            if (modifiers.selected)
                label = `${label}, gekies`;
            return label;
        },
        labelMonthDropdown: "Kies die maand",
        labelNext: "Gaan na volgende maand",
        labelPrevious: "Gaan na vorige maand",
        labelWeekNumber: (weekNumber) => `Week ${weekNumber}`,
        labelYearDropdown: "Kies die jaar",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Vandag, ${label}`;
            }
            return label;
        },
        labelNav: "Navigasiebalk",
        labelWeekNumberHeader: "Weeknommer",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
