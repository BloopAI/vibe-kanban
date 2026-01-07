import { sv as dateFnsSv } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Swedish locale extended with DayPicker-specific translations. */
export const sv = {
    ...dateFnsSv,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Idag, ${label}`;
            if (modifiers.selected)
                label = `${label}, vald`;
            return label;
        },
        labelMonthDropdown: "Välj månad",
        labelNext: "Gå till nästa månad",
        labelPrevious: "Gå till föregående månad",
        labelWeekNumber: (weekNumber) => `Vecka ${weekNumber}`,
        labelYearDropdown: "Välj år",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Idag, ${label}`;
            }
            return label;
        },
        labelNav: "Navigationsfält",
        labelWeekNumberHeader: "Veckonummer",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
