import { nl as dateFnsNl } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Dutch locale extended with DayPicker-specific translations. */
export const nl = {
    ...dateFnsNl,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Vandaag, ${label}`;
            if (modifiers.selected)
                label = `${label}, geselecteerd`;
            return label;
        },
        labelMonthDropdown: "Kies de maand",
        labelNext: "Ga naar volgende maand",
        labelPrevious: "Ga naar vorige maand",
        labelWeekNumber: (weekNumber) => `Week ${weekNumber}`,
        labelYearDropdown: "Kies het jaar",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Vandaag, ${label}`;
            }
            return label;
        },
        labelNav: "Navigatiebalk",
        labelWeekNumberHeader: "Weeknummer",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
