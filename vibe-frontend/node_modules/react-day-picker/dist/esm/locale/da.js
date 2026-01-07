import { da as dateFnsDa } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Danish locale extended with DayPicker-specific translations. */
export const da = {
    ...dateFnsDa,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `I dag, ${label}`;
            if (modifiers.selected)
                label = `${label}, valgt`;
            return label;
        },
        labelMonthDropdown: "Vælg måned",
        labelNext: "Gå til næste måned",
        labelPrevious: "Gå til forrige måned",
        labelWeekNumber: (weekNumber) => `Uge ${weekNumber}`,
        labelYearDropdown: "Vælg år",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `I dag, ${label}`;
            }
            return label;
        },
        labelNav: "Navigationslinje",
        labelWeekNumberHeader: "Ugenummer",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
