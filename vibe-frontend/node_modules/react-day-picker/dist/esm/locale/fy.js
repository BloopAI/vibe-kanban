import { fy as dateFnsFy } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Frisian locale extended with DayPicker-specific translations. */
export const fy = {
    ...dateFnsFy,
    labels: {
        labelDayButton: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers.today)
                label = `Hjoed, ${label}`;
            if (modifiers.selected)
                label = `${label}, selektearre`;
            return label;
        },
        labelMonthDropdown: "Kies de moanne",
        labelNext: "Nei folgjende moanne",
        labelPrevious: "Nei foarige moanne",
        labelWeekNumber: (weekNumber) => `Wike ${weekNumber}`,
        labelYearDropdown: "Kies it jier",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `Hjoed, ${label}`;
            }
            return label;
        },
        labelNav: "Navigaasjebalke",
        labelWeekNumberHeader: "Wikenûmer",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
