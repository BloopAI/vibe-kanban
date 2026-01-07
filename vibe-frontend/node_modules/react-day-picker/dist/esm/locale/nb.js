import { nb as dateFnsNb } from "date-fns/locale";
import { DateLib } from "../classes/DateLib.js";
/** Norwegian Bokmål locale extended with DayPicker-specific translations. */
export const nb = {
    ...dateFnsNb,
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
        labelMonthDropdown: "Velg måned",
        labelNext: "Gå til neste måned",
        labelPrevious: "Gå til forrige måned",
        labelWeekNumber: (weekNumber) => `Uke ${weekNumber}`,
        labelYearDropdown: "Velg år",
        labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
        labelGridcell: (date, modifiers, options, dateLib) => {
            const lib = dateLib ?? new DateLib(options);
            let label = lib.format(date, "PPPP");
            if (modifiers?.today) {
                label = `I dag, ${label}`;
            }
            return label;
        },
        labelNav: "Navigasjonslinje",
        labelWeekNumberHeader: "Ukenummer",
        labelWeekday: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
    },
};
