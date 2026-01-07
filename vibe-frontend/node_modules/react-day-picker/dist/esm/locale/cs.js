import { cs as dateFnsCs } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Czech locale extended with DayPicker-specific translations. */
export const cs = {
    ...dateFnsCs,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Dnes, ${label}`;
            if (modifiers.selected)
                label = `${label}, vybráno`;
            return label;
        },
        labelMonthDropdown: "Vyberte měsíc",
        labelNext: "Přejít na další měsíc",
        labelPrevious: "Přejít na předchozí měsíc",
        labelWeekNumber: (weekNumber) => `Týden ${weekNumber}`,
        labelYearDropdown: "Vyberte rok",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Dnes, ${label}`;
            }
            return label;
        },
        labelNav: "Navigační panel",
        labelWeekNumberHeader: "Číslo týdne",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
